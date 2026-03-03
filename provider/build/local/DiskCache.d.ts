/**
 * Local disk-based cache for native build artifacts.
 */
export declare class DiskCache {
    private readonly cacheDir;
    constructor(cacheDir: string);
    get(key: string): Promise<Buffer | null>;
    set(key: string, value: Buffer): Promise<void>;
    exists(key: string): Promise<boolean>;
    clear(): Promise<void>;
    private keyToPath;
}
//# sourceMappingURL=DiskCache.d.ts.map