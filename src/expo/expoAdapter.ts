import type {
	BuildCacheProviderPlugin,
	ResolveBuildCacheProps,
	UploadBuildCacheProps,
} from "@expo/config";
import path from "node:path";
import { HybridCacheProvider } from "../provider/HybridCacheProvider.js";
import type { HybridCacheConfig } from "../types/CacheTypes.js";
import { logger } from "../utils/logger.js";
import { getCacheKey } from "./buildCacheKey.js";
import { readBuildArtifact, writeCachedArtifact, copyToLocalCache } from "./buildArtifact.js";

/**
 * Expo adapter that wraps HybridCacheProvider to work with Expo's build cache system.
 */
export function createExpoCacheProvider(
	config: HybridCacheConfig,
): BuildCacheProviderPlugin<Partial<HybridCacheConfig> | undefined> {
	const cache = new HybridCacheProvider(config);
	const includeJSHash = config.includeJSHash ?? false;

	async function resolveBuildCache(
		args: ResolveBuildCacheProps,
	): Promise<string | null> {
		try {
			const cacheKey = await getCacheKey(args, includeJSHash);
			const cachedData = await cache.get(cacheKey);

			if (cachedData === null) {
				logger.debug(`Cache miss for key: ${cacheKey}`);
				return null;
			}

			const targetPath = path.join(config.localCacheDir, path.basename(cacheKey));
			await writeCachedArtifact(cachedData, cacheKey, targetPath);

			logger.info(`Cache hit for key: ${cacheKey}`);
			return targetPath;
		} catch (error) {
			logger.error(`Failed to resolve build cache:`, error);
			return null;
		}
	}

	async function uploadBuildCache(
		args: UploadBuildCacheProps,
	): Promise<string | null> {
		try {
			const cacheKey = await getCacheKey(args, includeJSHash);
			const buildData = await readBuildArtifact(args.buildPath);

			await cache.set(cacheKey, buildData);
			const localPath = await copyToLocalCache(args.buildPath, cacheKey, config.localCacheDir);

			logger.info(`Uploaded build cache for key: ${cacheKey}`);
			return localPath;
		} catch (error) {
			logger.error(`Failed to upload build cache:`, error);
			return null;
		}
	}

	return {
		resolveBuildCache,
		uploadBuildCache,
	};
}

