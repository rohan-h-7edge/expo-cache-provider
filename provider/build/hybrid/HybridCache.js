import { DiskCache } from "../local/DiskCache.js";
import { S3Cache } from "../s3/S3Cache.js";
import { logger } from "../utils/logger.js";
/**
 * Hybrid cache that implements local-first strategy with S3 fallback.
 */
export class HybridCache {
    diskCache;
    s3Cache;
    writeThrough;
    constructor(config) {
        this.diskCache = new DiskCache(config.localCacheDir);
        this.s3Cache = config.s3 && config.s3.bucket ? new S3Cache(config.s3) : null;
        this.writeThrough = config.writeThrough ?? true;
    }
    /**
     * Gets a value from cache (local-first, S3 fallback).
     */
    async get(key) {
        const localValue = await this.diskCache.get(key);
        if (localValue !== null) {
            logger.info(`Cache HIT (local): ${key}`);
            return localValue;
        }
        if (this.s3Cache) {
            logger.debug(`Cache MISS (local), checking S3: ${key}`);
            try {
                const s3Value = await this.s3Cache.get(key);
                if (s3Value !== null) {
                    logger.info(`Cache HIT (S3), writing to local: ${key}`);
                    await this.diskCache.set(key, s3Value).catch((error) => {
                        logger.warn(`Failed to write S3 hit to local: ${key}`, error);
                    });
                    return s3Value;
                }
            }
            catch (error) {
                logger.debug(`S3 check failed for key: ${key}`, error);
            }
        }
        logger.info(`Cache MISS (local and S3): ${key}`);
        return null;
    }
    /**
     * Sets a value in cache (local + S3 if writeThrough enabled).
     */
    async set(key, value) {
        await this.diskCache.set(key, value);
        if (this.writeThrough && this.s3Cache) {
            await this.s3Cache.set(key, value).catch((error) => {
                logger.warn(`Failed to write to S3: ${key}`, error);
            });
        }
    }
    /**
     * Checks if a key exists in cache.
     */
    async exists(key) {
        const localExists = await this.diskCache.exists(key);
        if (localExists)
            return true;
        if (this.s3Cache) {
            try {
                return await this.s3Cache.exists(key);
            }
            catch (error) {
                logger.debug(`S3 exists check failed: ${key}`, error);
                return false;
            }
        }
        return false;
    }
    /**
     * Clears all cached entries.
     */
    async clear() {
        await this.diskCache.clear();
        // S3 clear is not implemented (would require listing all objects)
        logger.warn("S3 cache clear is not implemented");
    }
}
//# sourceMappingURL=HybridCache.js.map