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
export declare class S3Cache {
    private readonly config;
    private readonly s3Client;
    constructor(config: S3Config);
    /**
     * Builds the full S3 key with optional prefix.
     */
    private getS3Key;
    /**
     * Checks if an object exists in S3.
     */
    exists(key: string): Promise<boolean>;
    /**
     * Downloads an object from S3.
     */
    get(key: string): Promise<Buffer | null>;
    /**
     * Uploads an object to S3.
     */
    set(key: string, data: Buffer): Promise<void>;
}
//# sourceMappingURL=S3Cache.d.ts.map