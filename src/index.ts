import { HybridCacheProvider } from "./provider/HybridCacheProvider.js";
import type { HybridCacheConfig } from "./types/CacheTypes.js";
import type { CacheProvider } from "./types/CacheTypes.js";

/**
 * Creates a new HybridCacheProvider instance.
 *
 * @example
 * ```typescript
 * const cache = createHybridCache({
 *   localCacheDir: "/tmp/cache",
 *   s3: {
 *     bucket: "my-cache-bucket",
 *     region: "us-east-1",
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 *   },
 * });
 *
 * const value = await cache.get("my-key");
 * await cache.set("my-key", Buffer.from("data"));
 * ```
 */

export function createHybridCache(
	config: HybridCacheConfig,
): CacheProvider {
	return new HybridCacheProvider(config);
}

// Export types
export type { CacheProvider, HybridCacheConfig, S3Config } from "./types/CacheTypes.js";

// Export implementations for advanced usage
export { HybridCacheProvider } from "./provider/HybridCacheProvider.js";
export { DiskCache } from "./local/DiskCache.js";
export { S3Cache } from "./s3/S3Cache.js";

// Export Expo adapter - this is the default export that Expo will use
export { default } from "./expo/index.js";
export { default as ExpoCacheProvider } from "./expo/index.js";
export { createExpoCacheProvider } from "./expo/expoAdapter.js";

// Build without device (cache + optional Gradle, no install) for CI / headless use
export {
	buildAndroidWithoutDevice,
	type BuildAndroidWithoutDeviceOptions,
} from "./expo/buildWithoutDevice.js";

