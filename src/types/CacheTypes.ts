/// <reference types="node" />

/**
 * Core cache provider interface
 */
export interface CacheProvider {
	/**
	 * Retrieves a value from the cache by key.
	 * Returns null if the key does not exist.
	 */
	get(key: string): Promise<Buffer | null>;

	/**
	 * Stores a value in the cache with the given key.
	 */
	set(key: string, value: Buffer): Promise<void>;

	/**
	 * Checks if a key exists in the cache.
	 */
	exists(key: string): Promise<boolean>;

	/**
	 * Clears all entries from the cache.
	 */
	clear(): Promise<void>;
}

/**
 * S3 configuration for hybrid cache
 */
export interface S3Config {
	/** S3 bucket name */
	bucket: string;
	/** AWS region */
	region: string;
	/** AWS access key ID (optional if using IAM role) */
	accessKeyId?: string;
	/** AWS secret access key (optional if using IAM role) */
	secretAccessKey?: string;
	/** Custom endpoint URL for S3-compatible services (e.g., Cloudflare R2) */
	endpoint?: string;
	/** Optional prefix for all S3 keys */
	prefix?: string;
}

/**
 * Configuration for HybridCacheProvider
 */
export interface HybridCacheConfig {
	/** Local disk cache directory path */
	localCacheDir: string;
	/** S3 configuration */
	s3: S3Config;
	/**
	 * If true, writes to both local and S3 on set().
	 * If false, only writes to local disk.
	 * Default: true
	 */
	writeThrough?: boolean;
	/**
	 * If true, clear() will also clear S3 cache.
	 * If false, clear() only clears local cache.
	 * Default: false
	 */
	clearS3OnClear?: boolean;
	/**
	 * If true, includes JavaScript file hash in cache key.
	 * This allows cache to detect JS-only changes and rebuild accordingly.
	 * Default: false (uses native fingerprint only, faster but may reuse old JS)
	 */
	includeJSHash?: boolean;
	/**
	 * If true, on cache hit the cached binary is repacked with a fresh JS bundle
	 * (expo export:embed then inject into APK/.app). Use with includeJSHash: false
	 * so cache key stays the same on JS-only changes and repack runs.
	 * Default: false
	 */
	enableRepack?: boolean;
}

