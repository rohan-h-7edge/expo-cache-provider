import type {
	BuildCacheProviderPlugin,
	ResolveBuildCacheProps,
	UploadBuildCacheProps,
} from "@expo/config";
import type { HybridCacheConfig } from "../types/CacheTypes.js";
import { HybridCacheProvider } from "../provider/HybridCacheProvider.js";
import { readFile, writeFile, cp, mkdir, stat } from "node:fs/promises";
import { createTarball, extractTarball } from "../utils/tar.js";
import { logger } from "../utils/logger.js";
import envPaths from "env-paths";
import path from "node:path";
import { Repack, generateJSBundle } from "expo-native-cache-provider";

const packageName = "expo-cache-provider";

/**
 * Gets the default local cache directory.
 */
function getDefaultCacheDir(): string {
	return path.join(envPaths(packageName, { suffix: "" }).temp, "build-run-cache");
}

import { calculateJSHash } from "./fingerprintUtils.js";

/**
 * Generates a cache key from Expo build cache props.
 * Optionally includes JS hash to detect JavaScript-only changes.
 */
async function getCacheKey(
	{
		fingerprintHash,
		platform,
		projectRoot,
		runOptions,
	}: ResolveBuildCacheProps,
	includeJSHash: boolean = false,
): Promise<string> {
	const isDevClient =
		("variant" in runOptions && runOptions.variant === "debug") ||
		("configuration" in runOptions && runOptions.configuration === "Debug");

	let tag = `fingerprint.${fingerprintHash}`;
	
	// Include JS hash if enabled (for detecting JS-only changes)
	if (includeJSHash) {
		try {
			const jsHash = await calculateJSHash(projectRoot);
			tag += `.js${jsHash}`;
		} catch (error) {
			// Log but continue with native fingerprint only
			console.debug("Failed to calculate JS hash, using native fingerprint only", error);
		}
	}
	
	tag += isDevClient ? ".dev-client" : "";
	const extension = platform === "ios" ? "app" : "apk";
	return `${tag}.${extension}`;
}

/**
 * Creates an Expo build cache provider plugin.
 * This is the default export that Expo will use.
 */
const ExpoCacheProvider = {
	async resolveBuildCache(
		args: ResolveBuildCacheProps,
		options?: Partial<HybridCacheConfig> | undefined,
	): Promise<string | null> {
		try {
			const config = normalizeConfig(options);
			const cache = new HybridCacheProvider(config);
			const includeJSHash = config.includeJSHash ?? false;
			const cacheKey = await getCacheKey(args, includeJSHash);
			const cachedData = await cache.get(cacheKey);

			if (cachedData === null) {
				logger.debug(`Cache miss for key: ${cacheKey}`);
				return null;
			}

			// Determine target path
			const targetPath = path.join(
				config.localCacheDir,
				path.basename(cacheKey),
			);
			await mkdir(path.dirname(targetPath), { recursive: true });

			// Extract tarball if it's a directory (.app), otherwise write file (.apk)
			if (cacheKey.endsWith(".app")) {
				await extractTarball(cachedData, targetPath);
			} else {
				await writeFile(targetPath, cachedData);
			}

			// If repack is enabled, inject fresh JS bundle into cached binary
			if (config.enableRepack) {
				try {
					const jsBundlePath = await generateJSBundle(args.projectRoot, args.platform);
					const repackedPath = path.join(
						config.localCacheDir,
						`repacked-${path.basename(cacheKey)}`,
					);
					if (args.platform === "android") {
						await Repack.repackAndroid(targetPath, jsBundlePath, repackedPath, args.projectRoot);
					} else {
						await Repack.repackIOS(targetPath, jsBundlePath, repackedPath, args.projectRoot);
					}
					logger.info(`Repacked binary with fresh JS: ${repackedPath}`);
					return repackedPath;
				} catch (error) {
					logger.warn(`Repack failed, using cached binary as-is: ${error}`);
				}
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
			const includeJSHash = config.includeJSHash ?? false;
			const cacheKey = await getCacheKey(args, includeJSHash);
			
			// Check if buildPath is a directory (.app) or file (.apk)
			const buildStats = await stat(args.buildPath);
			let buildData: Buffer;

			if (buildStats.isDirectory()) {
				// Create tarball for directories
				buildData = await createTarball(args.buildPath);
			} else {
				// Read file directly
				buildData = await readFile(args.buildPath);
			}

			// Store in cache (will write to both local and S3 if writeThrough is enabled)
			await cache.set(cacheKey, buildData);

			// Also ensure it's in the local cache directory for fast access
			const localPath = path.join(
				config.localCacheDir,
				path.basename(cacheKey),
			);
			await mkdir(path.dirname(localPath), { recursive: true });
			await cp(args.buildPath, localPath, { recursive: true });

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

