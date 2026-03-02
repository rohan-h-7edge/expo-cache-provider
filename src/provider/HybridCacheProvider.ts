import type { CacheProvider, HybridCacheConfig } from "../types/CacheTypes.js";
import { DiskCache } from "../local/DiskCache.js";
import { S3Cache } from "../s3/S3Cache.js";
import { logger } from "../utils/logger.js";

/**
 * Hybrid cache provider that implements local-first strategy:
 * - Checks local disk first
 * - Falls back to S3 on cache miss
 * - Writes back to local after S3 hit
 * - Writes to both local and S3 on set (if writeThrough is enabled)
 */
export class HybridCacheProvider implements CacheProvider {
	private readonly diskCache: DiskCache;
	private readonly s3Cache: S3Cache;
	private readonly writeThrough: boolean;
	private readonly clearS3OnClear: boolean;

	constructor(config: HybridCacheConfig) {
		this.diskCache = new DiskCache(config.localCacheDir);
		this.s3Cache = new S3Cache(config.s3);
		this.writeThrough = config.writeThrough ?? true;
		this.clearS3OnClear = config.clearS3OnClear ?? false;
	}

	async get(key: string): Promise<Buffer | null> {
		// Step 1: Check local disk first
		const localValue = await this.diskCache.get(key);
		if (localValue !== null) {
			logger.debug(`Hybrid cache HIT (local): ${key}`);
			return localValue;
		}

		// Step 2: Local miss, check S3
		logger.debug(`Hybrid cache MISS (local), checking S3: ${key}`);
		try {
			const s3Value = await this.s3Cache.get(key);
			if (s3Value !== null) {
				// Step 3: S3 hit, write back to local disk
				logger.debug(`Hybrid cache HIT (S3), writing to local: ${key}`);
				await this.diskCache.set(key, s3Value).catch((error) => {
					// Log but don't fail if local write fails
					logger.warn(`Failed to write S3 hit to local cache: ${key}`, error);
				});
				return s3Value;
			}
		} catch (error) {
			// S3 check failed (e.g., no credentials, network error)
			// Log but continue - this is expected if S3 is not configured
			logger.debug(`S3 check failed for key: ${key}`, error);
		}

		// Step 4: Both missed
		logger.debug(`Hybrid cache MISS (local and S3): ${key}`);
		return null;
	}

	async set(key: string, value: Buffer): Promise<void> {
		// Always write to local disk
		await this.diskCache.set(key, value);

		// Write to S3 if writeThrough is enabled
		if (this.writeThrough) {
			await this.s3Cache.set(key, value).catch((error: unknown) => {
				const msg = error instanceof Error ? error.message : String(error);
				const short = msg.includes("credentials") ? "S3 not configured or missing credentials" : msg;
				logger.warn(`Failed to write to S3 cache: ${key} ${short}`);
			});
		}
	}

	async exists(key: string): Promise<boolean> {
		// Check local disk first
		const localExists = await this.diskCache.exists(key);
		if (localExists) {
			return true;
		}

		// If not found locally, check S3
		try {
			return await this.s3Cache.exists(key);
		} catch (error) {
			// S3 check failed (e.g., no credentials, network error)
			// Return false - this is expected if S3 is not configured
			logger.debug(`S3 exists check failed for key: ${key}`, error);
			return false;
		}
	}

	async clear(): Promise<void> {
		// Always clear local cache
		await this.diskCache.clear();

		// Clear S3 if configured
		if (this.clearS3OnClear) {
			// Note: S3Cache.clear() throws by default, but we can catch it
			await this.s3Cache.clear().catch((error) => {
				logger.warn("Failed to clear S3 cache", error);
			});
		}
	}
}

