/**
 * Local disk-based cache for native build artifacts.
 */
export declare class DiskCache {
    private readonly cacheDir;
    constructor(cacheDir: string);
    /**
     * Gets a cached file by key.
     */
    get(key: string): Promise<Buffer | null>;
    /**
     * Stores a file in cache.
     */
    set(key: string, value: Buffer): Promise<void>;
    /**
     * Checks if a key exists in cache.
     */
    exists(key: string): Promise<boolean>;
    /**
     * Clears all cached files.
     */
    clear(): Promise<void>;
    /**
     * Converts a cache key to a file path.
     */
    private keyToPath;
}
//# sourceMappingURL=DiskCache.d.ts.map