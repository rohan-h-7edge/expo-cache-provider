import type {
	BuildCacheProviderPlugin,
	ResolveBuildCacheProps,
	UploadBuildCacheProps,
} from "@expo/config";
import { readFile, writeFile, cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { createTarball, extractTarball } from "../utils/tar.js";
import { HybridCacheProvider } from "../provider/HybridCacheProvider.js";
import type { HybridCacheConfig } from "../types/CacheTypes.js";
import { logger } from "../utils/logger.js";
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
			logger.debug("Failed to calculate JS hash, using native fingerprint only", error);
		}
	}
	
	tag += isDevClient ? ".dev-client" : "";
	const extension = platform === "ios" ? "app" : "apk";
	return `${tag}.${extension}`;
}

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
	}

	return {
		resolveBuildCache,
		uploadBuildCache,
	};
}

