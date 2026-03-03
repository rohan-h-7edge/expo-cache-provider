import { type S3Config } from "../s3/S3Cache.js";
export interface SigningConfig {
    /** Path to the keystore file. Defaults to the project's debug.keystore. */
    keystorePath?: string;
    /** Keystore password. Defaults to "android". */
    keystorePassword?: string;
    /** Key alias. Defaults to "androiddebugkey". */
    keyAlias?: string;
    /** Key password. Defaults to "android". */
    keyPassword?: string;
    /** Set to true to skip APK signing entirely after repack. */
    disabled?: boolean;
}
export interface HybridCacheConfig {
    localCacheDir: string;
    s3?: S3Config;
    writeThrough?: boolean;
    enableRepack?: boolean;
    signing?: SigningConfig;
}
/**
 * Hybrid cache that implements local-first strategy with S3 fallback.
 */
export declare class HybridCache {
    private readonly diskCache;
    private readonly s3Cache;
    private readonly writeThrough;
    constructor(config: HybridCacheConfig);
    /**
     * Gets a value from cache (local-first, S3 fallback).
     */
    get(key: string): Promise<Buffer | null>;
    /**
     * Sets a value in cache (local + S3 if writeThrough enabled).
     */
    set(key: string, value: Buffer): Promise<void>;
    /**
     * Checks if a key exists in cache.
     */
    exists(key: string): Promise<boolean>;
    /**
     * Clears all cached entries.
     */
    clear(): Promise<void>;
}
//# sourceMappingURL=HybridCache.d.ts.map