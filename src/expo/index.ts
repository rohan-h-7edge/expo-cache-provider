import type {
	BuildCacheProviderPlugin,
	ResolveBuildCacheProps,
	UploadBuildCacheProps,
} from "@expo/config";
import type { HybridCacheConfig } from "../types/CacheTypes.js";
import { HybridCacheProvider } from "../provider/HybridCacheProvider.js";
import { logger } from "../utils/logger.js";
import envPaths from "env-paths";
import path from "node:path";
import { Repack, generateJSBundle } from "expo-native-cache-provider";
import { getCacheKey } from "./buildCacheKey.js";
import { readBuildArtifact, writeCachedArtifact, copyToLocalCache } from "./buildArtifact.js";

const packageName = "expo-cache-provider";

function getDefaultCacheDir(): string {
	return path.join(envPaths(packageName, { suffix: "" }).temp, "build-run-cache");
}

async function repackBinary(
	targetPath: string,
	cacheKey: string,
	args: ResolveBuildCacheProps,
	localCacheDir: string,
): Promise<string | null> {
	try {
		const jsBundlePath = await generateJSBundle(args.projectRoot, args.platform);
		const repackedPath = path.join(localCacheDir, `repacked-${path.basename(cacheKey)}`);
		if (args.platform === "android") {
			await Repack.repackAndroid(targetPath, jsBundlePath, repackedPath, args.projectRoot);
		} else {
			await Repack.repackIOS(targetPath, jsBundlePath, repackedPath, args.projectRoot);
		}
		logger.info(`Repacked binary with fresh JS: ${repackedPath}`);
		return repackedPath;
	} catch (error) {
		logger.warn(`Repack failed, using cached binary as-is: ${error}`);
		return null;
	}
}

/**
 * Expo build cache provider plugin (default export consumed by Expo).
 */
const ExpoCacheProvider = {
	async resolveBuildCache(
		args: ResolveBuildCacheProps,
		options?: Partial<HybridCacheConfig> | undefined,
	): Promise<string | null> {
		try {
			const config = normalizeConfig(options);
			const cache = new HybridCacheProvider(config);
			const cacheKey = await getCacheKey(args, config.includeJSHash ?? false);
			const cachedData = await cache.get(cacheKey);

			if (cachedData === null) {
				logger.debug(`Cache miss for key: ${cacheKey}`);
				return null;
			}

			const targetPath = path.join(config.localCacheDir, path.basename(cacheKey));
			await writeCachedArtifact(cachedData, cacheKey, targetPath);

			if (config.enableRepack) {
				const repacked = await repackBinary(targetPath, cacheKey, args, config.localCacheDir);
				if (repacked !== null) return repacked;
			}

			logger.info(`Cache hit for key: ${cacheKey}`);
			return targetPath;
		} catch (error) {
			logger.error(`Failed to resolve build cache:`, error);
			return null;
		}
	},
	
	async uploadBuildCache(
		args: UploadBuildCacheProps,
		options?: Partial<HybridCacheConfig> | undefined,
	): Promise<string | null> {
		try {
			const config = normalizeConfig(options);
			const cache = new HybridCacheProvider(config);
			const cacheKey = await getCacheKey(args, config.includeJSHash ?? false);
			const buildData = await readBuildArtifact(args.buildPath);

			await cache.set(cacheKey, buildData);
			const localPath = await copyToLocalCache(args.buildPath, cacheKey, config.localCacheDir);

			logger.info(`Uploaded build cache for key: ${cacheKey}`);
			return localPath;
		} catch (error) {
			logger.error(`Failed to upload build cache:`, error);
			return null;
		}
	},
} satisfies BuildCacheProviderPlugin<Partial<HybridCacheConfig> | undefined>;

/**
 * Normalizes the configuration, applying defaults and environment variables.
 */
function normalizeConfig(
	options?: Partial<HybridCacheConfig>,
): HybridCacheConfig {
	const env = process.env;

	return {
		localCacheDir:
			options?.localCacheDir ||
			env.EXPO_CACHE_LOCAL_DIR ||
			getDefaultCacheDir(),
		s3: {
			bucket:
				options?.s3?.bucket ||
				env.EXPO_CACHE_S3_BUCKET ||
				env.AWS_S3_BUCKET ||
				"",
			region:
				options?.s3?.region ||
				env.EXPO_CACHE_S3_REGION ||
				env.AWS_REGION ||
				"",
			accessKeyId:
				options?.s3?.accessKeyId ||
				env.EXPO_CACHE_S3_ACCESS_KEY_ID ||
				env.AWS_ACCESS_KEY_ID,
			secretAccessKey:
				options?.s3?.secretAccessKey ||
				env.EXPO_CACHE_S3_SECRET_ACCESS_KEY ||
				env.AWS_SECRET_ACCESS_KEY,
			endpoint:
				options?.s3?.endpoint ||
				env.EXPO_CACHE_S3_ENDPOINT,
			prefix:
				options?.s3?.prefix ||
				env.EXPO_CACHE_S3_PREFIX,
		},
		writeThrough: options?.writeThrough ?? true,
		clearS3OnClear: options?.clearS3OnClear ?? false,
		includeJSHash: options?.includeJSHash ?? false,
		enableRepack: options?.enableRepack ?? false,
	};
}

export default ExpoCacheProvider;

// Export types for TypeScript users
export type { HybridCacheConfig } from "../types/CacheTypes.js";

