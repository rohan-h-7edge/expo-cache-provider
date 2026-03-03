import {
	S3Client,
	HeadObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3Config } from "../types/CacheTypes.js";
import { S3CacheError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

const PRESIGNED_URL_EXPIRES_IN = 15 * 60; // 15 minutes

/**
 * Creates an S3 client wrapper with cache-specific operations.
 */
export function createS3Client(config: S3Config) {
	const s3Client = new S3Client({
		region: config.region,
		endpoint: config.endpoint,
		credentials: config.accessKeyId
			? {
					accessKeyId: config.accessKeyId,
					secretAccessKey: config.secretAccessKey || "",
				}
			: undefined,
		forcePathStyle: config.endpoint !== undefined, // Required for S3-compatible services
	});

	/**
	 * Builds the full S3 key with optional prefix.
	 */
	function getS3Key(key: string): string {
		return config.prefix ? `${config.prefix}/${key}` : key;
	}

	/**
	 * Checks if an object exists in S3.
	 */
	async function exists(key: string): Promise<boolean> {
		try {
			await s3Client.send(
				new HeadObjectCommand({
					Bucket: config.bucket,
					Key: getS3Key(key),
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
			throw new S3CacheError(`Failed to check existence of key: ${key}`, error);
		}
	}

	async function getPresignedUrl(command: GetObjectCommand | PutObjectCommand, key: string): Promise<string> {
		try {
			return await getSignedUrl(s3Client, command, { expiresIn: PRESIGNED_URL_EXPIRES_IN });
		} catch (error) {
			throw new S3CacheError(`Failed to get presigned URL for key: ${key}`, error);
		}
	}

	/**
	 * Downloads an object from S3 and returns it as a Buffer.
	 */
	async function download(key: string): Promise<Buffer> {
		try {
			const url = await getPresignedUrl(
				new GetObjectCommand({ Bucket: config.bucket, Key: getS3Key(key) }),
				key,
			);
			const response = await fetch(url);
			if (!response.ok) {
				if (response.status === 404) {
					throw new S3CacheError(`Object not found: ${key}`);
				}
				throw new S3CacheError(
					`Failed to download object: ${key} (${response.status})`,
				);
			}

			const totalBytes = parseInt(response.headers.get("content-length") ?? "0", 10);
			const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
			logger.info(`Downloading from S3${totalBytes > 0 ? ` (${totalMB} MB)` : ""}...`);

			const chunks: Uint8Array[] = [];
			let receivedBytes = 0;
			let lastLoggedPct = 0;
			const reader = response.body!.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				receivedBytes += value.length;
				if (totalBytes > 0) {
					const pct = Math.floor((receivedBytes / totalBytes) * 100);
					if (pct >= lastLoggedPct + 25) {
						lastLoggedPct = Math.floor(pct / 25) * 25;
						logger.info(`  ↓ ${(receivedBytes / 1024 / 1024).toFixed(1)} / ${totalMB} MB (${lastLoggedPct}%)`);
					}
				}
			}

			logger.info(`  ✓ Download complete`);
			return Buffer.concat(chunks);
		} catch (error) {
			if (error instanceof S3CacheError) {
				throw error;
			}
			throw new S3CacheError(`Failed to download key: ${key}`, error);
		}
	}

	/**
	 * Uploads a Buffer to S3.
	 */
	async function upload(key: string, data: Buffer): Promise<void> {
		try {
			const url = await getPresignedUrl(
				new PutObjectCommand({ Bucket: config.bucket, Key: getS3Key(key) }),
				key,
			);
			const sizeMB = (data.length / 1024 / 1024).toFixed(1);
			logger.info(`Uploading to S3 (${sizeMB} MB)...`);
			const response = await fetch(url, {
				method: "PUT",
				body: data,
				headers: { "Content-Type": "application/octet-stream" },
			});
			if (!response.ok) {
				throw new S3CacheError(
					`Failed to upload object: ${key} (${response.status})`,
				);
			}
			logger.info(`  ✓ S3 upload complete`);
		} catch (error) {
			if (error instanceof S3CacheError) {
				throw error;
			}
			throw new S3CacheError(`Failed to upload key: ${key}`, error);
		}
	}

	return {
		exists,
		download,
		upload,
	};
}






