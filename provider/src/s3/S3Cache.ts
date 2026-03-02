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
			if (
				error &&
				typeof error === "object" &&
				"name" in error &&
				error.name === "NotFound"
			) {
				return false;
			}
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

			const chunks: Uint8Array[] = [];
			for await (const chunk of response.Body as any) {
				chunks.push(chunk);
			}

			const buffer = Buffer.concat(chunks);
			logger.debug(`S3 cache HIT: ${key}`);
			return buffer;
		} catch (error: any) {
			if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
				logger.debug(`S3 cache MISS: ${key}`);
				return null;
			}
			logger.error(`Failed to get from S3: ${key}`, error);
			return null;
		}
	}

	/**
	 * Uploads an object to S3.
	 */
	async set(key: string, data: Buffer): Promise<void> {
		try {
			const s3Key = this.getS3Key(key);
			const command = new PutObjectCommand({
				Bucket: this.config.bucket,
				Key: s3Key,
				Body: data,
				ContentType: "application/octet-stream",
			});

			await this.s3Client.send(command);
			logger.debug(`S3 cache SET: ${key}`);
		} catch (error) {
			logger.error(`Failed to set in S3: ${key}`, error);
			throw error;
		}
	}
}

