import type { CacheProvider } from "../types/CacheTypes.js";
import { S3CacheError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { hashKey } from "../utils/hash.js";
import { createS3Client } from "./s3Client.js";
import type { S3Config } from "../types/CacheTypes.js";

/**
 * S3-based cache implementation.
 * Uses presigned URLs for upload/download operations.
 */
export class S3Cache implements CacheProvider {
	private readonly s3Client: ReturnType<typeof createS3Client>;

	constructor(private readonly config: S3Config) {
		this.s3Client = createS3Client(config);
	}

	/**
	 * Converts a cache key to an S3-safe key by hashing it.
	 */
	private getS3Key(key: string): string {
		return hashKey(key);
	}

	async get(key: string): Promise<Buffer | null> {
		try {
			const s3Key = this.getS3Key(key);
			const exists = await this.s3Client.exists(s3Key);
			if (!exists) {
				logger.debug(`S3 cache MISS: ${key}`);
				return null;
			}
			const data = await this.s3Client.download(s3Key);
			logger.debug(`S3 cache HIT: ${key}`);
			return data;
		} catch (error) {
			if (error instanceof S3CacheError && error.message.includes("not found")) {
				return null;
			}
			throw new S3CacheError(`Failed to get cache key: ${key}`, error);
		}
	}

	async set(key: string, value: Buffer): Promise<void> {
		try {
			const s3Key = this.getS3Key(key);
			await this.s3Client.upload(s3Key, value);
			logger.debug(`S3 cache SET: ${key}`);
		} catch (error) {
			throw new S3CacheError(`Failed to set cache key: ${key}`, error);
		}
	}

	async exists(key: string): Promise<boolean> {
		try {
			const s3Key = this.getS3Key(key);
			return await this.s3Client.exists(s3Key);
		} catch (error) {
			throw new S3CacheError(`Failed to check existence of key: ${key}`, error);
		}
	}

	async clear(): Promise<void> {
		// S3 clear would require listing and deleting all objects with the prefix
		// This is expensive and potentially dangerous, so we log a warning
		logger.warn(
			"S3 cache clear() is not implemented. Use clearS3OnClear option in HybridCacheProvider to enable S3 clearing.",
		);
		throw new S3CacheError(
			"S3 cache clear() is not implemented. Use HybridCacheProvider.clear() with clearS3OnClear enabled.",
		);
	}
}






