import {
	S3Client,
	HeadObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import { logger } from "../utils/logger.js";

export interface S3Config {
	bucket: string;
	region: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	endpoint?: string;
	prefix?: string;
}

/**
 * S3-based cache for native build artifacts.
 */
export class S3Cache {
	private readonly s3Client: S3Client;

	constructor(private readonly config: S3Config) {
		this.s3Client = new S3Client({
			region: config.region,
			endpoint: config.endpoint,
			credentials: config.accessKeyId
				? {
						accessKeyId: config.accessKeyId,
						secretAccessKey: config.secretAccessKey || "",
					}
				: undefined,
			forcePathStyle: config.endpoint !== undefined,
		});
	}

	/**
	 * Builds the full S3 key with optional prefix.
	 */
	private getS3Key(key: string): string {
		return this.config.prefix ? `${this.config.prefix}/${key}` : key;
	}

	/**
	 * Checks if an object exists in S3.
	 */
	async exists(key: string): Promise<boolean> {
		try {
			await this.s3Client.send(
				new HeadObjectCommand({
					Bucket: this.config.bucket,
					Key: this.getS3Key(key),
				}),
			);
			return true;
		} catch (error) {
			const awsError = error as { name?: string };
			if (awsError.name === "NotFound") return false;
			logger.error(`Failed to check S3 existence: ${key}`, error);
			return false;
		}
	}

	/**
	 * Downloads an object from S3.
	 */
	async get(key: string): Promise<Buffer | null> {
		try {
			const s3Key = this.getS3Key(key);
			const command = new GetObjectCommand({
				Bucket: this.config.bucket,
				Key: s3Key,
			});

			const response = await this.s3Client.send(command);
			if (!response.Body) {
				logger.debug(`S3 cache MISS: ${key}`);
				return null;
			}

			const totalBytes = response.ContentLength ?? 0;
			const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
			logger.info(`Downloading from S3${totalBytes > 0 ? ` (${totalMB} MB)` : ""}...`);

			const chunks: Uint8Array[] = [];
			let receivedBytes = 0;
			let lastLoggedPct = 0;
			for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
				chunks.push(chunk);
				receivedBytes += chunk.length;
				if (totalBytes > 0) {
					const pct = Math.floor((receivedBytes / totalBytes) * 100);
					if (pct >= lastLoggedPct + 25) {
						lastLoggedPct = Math.floor(pct / 25) * 25;
						logger.info(`  ↓ ${(receivedBytes / 1024 / 1024).toFixed(1)} / ${totalMB} MB (${lastLoggedPct}%)`);
					}
				}
			}

			const buffer = Buffer.concat(chunks);
			logger.info(`  ✓ Download complete`);
			logger.debug(`S3 cache HIT: ${key}`);
			return buffer;
		} catch (error) {
			const awsError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
			if (awsError.name === "NoSuchKey" || awsError.$metadata?.httpStatusCode === 404) {
				logger.debug(`S3 cache MISS: ${key}`);
				return null;
			}
			logger.error(`Failed to get from S3: ${key}`, awsError);
			return null;
		}
	}

	/**
	 * Uploads an object to S3.
	 */
	async set(key: string, data: Buffer): Promise<void> {
		try {
			const s3Key = this.getS3Key(key);
			const sizeMB = (data.length / 1024 / 1024).toFixed(1);
			logger.info(`Uploading to S3 (${sizeMB} MB)...`);
			const command = new PutObjectCommand({
				Bucket: this.config.bucket,
				Key: s3Key,
				Body: data,
				ContentType: "application/octet-stream",
			});

			await this.s3Client.send(command);
			logger.info(`  ✓ S3 upload complete`);
			logger.debug(`S3 cache SET: ${key}`);
		} catch (error) {
			logger.error(`Failed to set in S3: ${key}`, error);
			throw error;
		}
	}
}

