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
		const localValue = await this.diskCache.get(key);
		if (localValue !== null) {
			logger.debug(`Hybrid cache HIT (local): ${key}`);
			return localValue;
		}

		logger.debug(`Hybrid cache MISS (local), checking S3: ${key}`);
		try {
			const s3Value = await this.s3Cache.get(key);
			if (s3Value !== null) {
				logger.debug(`Hybrid cache HIT (S3), writing to local: ${key}`);
				await this.diskCache.set(key, s3Value).catch((error) => {
					logger.warn(`Failed to write S3 hit to local cache: ${key}`, error);
				});
				return s3Value;
			}
		} catch (error) {
			logger.debug(`S3 check failed for key: ${key}`, error);
		}

		logger.debug(`Hybrid cache MISS (local and S3): ${key}`);
		return null;
	}

	async set(key: string, value: Buffer): Promise<void> {
		await this.diskCache.set(key, value);

		if (this.writeThrough) {
			await this.s3Cache.set(key, value).catch((error: unknown) => {
				logger.warn(`Failed to write to S3 cache: ${key} ${summarizeS3Error(error)}`);
			});
		}
	}

	async exists(key: string): Promise<boolean> {
		const localExists = await this.diskCache.exists(key);
		if (localExists) return true;

		try {
			return await this.s3Cache.exists(key);
		} catch (error) {
			logger.debug(`S3 exists check failed for key: ${key}`, error);
			return false;
		}
	}

	async clear(): Promise<void> {
		await this.diskCache.clear();

		if (this.clearS3OnClear) {
			await this.s3Cache.clear().catch((error) => {
				logger.warn("Failed to clear S3 cache", error);
			});
		}
	}
}

function summarizeS3Error(error: unknown): string {
	const msg = error instanceof Error ? error.message : String(error);
	return msg.includes("credentials") ? "S3 not configured or missing credentials" : msg;
}

