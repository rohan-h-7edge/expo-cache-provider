import { readFile, writeFile, cp, mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { create, extract } from "tar";
import { tmpdir } from "node:os";
import { calculateNativeFingerprint } from "./fingerprint/nativeFingerprint.js";
import { detectProfile, shouldUseCache, buildCacheKey } from "./utils/guards.js";
import { HybridCache } from "./hybrid/HybridCache.js";
import { logger } from "./utils/logger.js";
import { Repack } from "./repack/Repack.js";
import { execSync } from "node:child_process";
import envPaths from "env-paths";
const packageName = "expo-native-cache-provider";
/**
 * Gets the default local cache directory.
 */
function getDefaultCacheDir() {
    return path.join(envPaths(packageName, { suffix: "" }).temp, "native-cache");
}
/**
 * Creates a tarball (gzipped tar) from a directory.
 */
async function createTarballData(sourceDir) {
    const tempFile = path.join(tmpdir(), `native-cache-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`);
    try {
        await create({
            cwd: path.dirname(sourceDir),
            file: tempFile,
            gzip: true,
        }, [path.basename(sourceDir)]);
        const data = await readFile(tempFile);
        await unlink(tempFile);
        return data;
    }
    catch (error) {
        try {
            await unlink(tempFile);
        }
        catch {
            // Ignore cleanup errors
        }
        throw error;
    }
}
/**
 * Extracts a tarball (gzipped tar) to a target directory.
 */
async function extractTarballData(tarballData, targetDir) {
    const tempFile = path.join(tmpdir(), `native-cache-extract-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`);
    try {
        await mkdir(path.dirname(targetDir), { recursive: true });
        await writeFile(tempFile, tarballData);
        await extract({
            cwd: path.dirname(targetDir),
            file: tempFile,
            gzip: true,
        });
        await unlink(tempFile);
    }
    catch (error) {
        try {
            await unlink(tempFile);
        }
        catch {
            // Ignore cleanup errors
        }
        throw error;
    }
}
/**
 * Normalizes configuration with defaults.
 */
function normalizeConfig(options) {
    const env = process.env;
    return {
        localCacheDir: options?.localCacheDir ||
            env.EXPO_NATIVE_CACHE_LOCAL_DIR ||
            getDefaultCacheDir(),
        s3: options?.s3?.bucket
            ? {
                bucket: options.s3.bucket,
                region: options.s3.region || env.EXPO_NATIVE_CACHE_S3_REGION || "",
                accessKeyId: options.s3.accessKeyId ||
                    env.EXPO_NATIVE_CACHE_S3_ACCESS_KEY_ID,
                secretAccessKey: options.s3.secretAccessKey ||
                    env.EXPO_NATIVE_CACHE_S3_SECRET_ACCESS_KEY,
                endpoint: options.s3.endpoint || env.EXPO_NATIVE_CACHE_S3_ENDPOINT,
                prefix: options.s3.prefix || env.EXPO_NATIVE_CACHE_S3_PREFIX,
            }
            : undefined,
        writeThrough: options?.writeThrough ?? true,
        enableRepack: options?.enableRepack ?? false,
    };
}
/**
 * Native-only cache provider plugin.
 *
 * Features:
 * - Caches native build artifacts only (APK/.app)
 * - Does NOT invalidate on JS/TS changes
 * - Blocks production builds
 * - Supports development and qa profiles only
 */
const NativeCacheProvider = {
    /**
     * Custom fingerprint calculation that excludes JS/TS files.
     */
    async calculateFingerprintHash(props, options) {
        try {
            const fingerprint = await calculateNativeFingerprint(props.projectRoot, props.platform, props.runOptions);
            logger.debug(`Calculated native fingerprint: ${fingerprint.slice(0, 16)}...`);
            return fingerprint;
        }
        catch (error) {
            logger.error("Failed to calculate native fingerprint", error);
            return null;
        }
    },
    /**
     * Resolves (reads) a cached build.
     */
    async resolveBuildCache(args, options) {
        try {
            // Detect profile
            const profile = detectProfile(args.runOptions, args.projectRoot);
            // Guard: Skip production builds
            if (!shouldUseCache(profile)) {
                logger.info(`Cache SKIP: ${profile} profile not cached`);
                return null;
            }
            // Build cache key
            const cacheKey = buildCacheKey(profile, args.platform, args.fingerprintHash);
            // Initialize cache
            const config = normalizeConfig(options);
            const cache = new HybridCache(config);
            // Try to get from cache
            const cachedData = await cache.get(cacheKey);
            if (cachedData === null) {
                logger.info(`Cache MISS: ${cacheKey}`);
                return null;
            }
            // Write cached data to expected location
            const targetPath = path.join(config.localCacheDir, path.basename(cacheKey));
            await mkdir(path.dirname(targetPath), { recursive: true });
            // Extract tarball if it's a directory (.app), otherwise write file (.apk)
            if (cacheKey.endsWith(".app")) {
                await extractTarballData(cachedData, targetPath);
            }
            else {
                await writeFile(targetPath, cachedData);
            }
            // If repack is enabled, inject fresh JS bundle into cached binary
            if (config.enableRepack) {
                try {
                    const jsBundlePath = await generateJSBundle(args.projectRoot, args.platform);
                    const repackedPath = path.join(config.localCacheDir, `repacked-${path.basename(cacheKey)}`);
                    if (args.platform === "android") {
                        await Repack.repackAndroid(targetPath, jsBundlePath, repackedPath, args.projectRoot);
                    }
                    else {
                        await Repack.repackIOS(targetPath, jsBundlePath, repackedPath, args.projectRoot);
                    }
                    logger.info(`Repacked binary with fresh JS: ${repackedPath}`);
                    return repackedPath;
                }
                catch (error) {
                    logger.warn(`Repack failed, using cached binary as-is: ${error}`);
                    // Fall back to cached binary without repack
                }
            }
            logger.info(`Cache HIT: ${cacheKey}`);
            return targetPath;
        }
        catch (error) {
            logger.error("Failed to resolve build cache", error);
            return null;
        }
    },
    /**
     * Uploads (writes) a build to cache.
     */
    async uploadBuildCache(args, options) {
        try {
            // Detect profile
            const profile = detectProfile(args.runOptions, args.projectRoot);
            // Guard: Skip production builds
            if (!shouldUseCache(profile)) {
                logger.info(`Cache SKIP: ${profile} profile not cached`);
                return null;
            }
            // Build cache key
            const cacheKey = buildCacheKey(profile, args.platform, args.fingerprintHash);
            // Initialize cache
            const config = normalizeConfig(options);
            const cache = new HybridCache(config);
            // Check if buildPath is a directory (.app) or file (.apk)
            const buildStats = await stat(args.buildPath);
            let buildData;
            if (buildStats.isDirectory()) {
                // Create tarball for directories
                buildData = await createTarballData(args.buildPath);
            }
            else {
                // Read file directly
                buildData = await readFile(args.buildPath);
            }
            // Store in cache (will write to both local and S3 if writeThrough is enabled)
            await cache.set(cacheKey, buildData);
            // Also ensure it's in the local cache directory for fast access
            const localPath = path.join(config.localCacheDir, path.basename(cacheKey));
            await mkdir(path.dirname(localPath), { recursive: true });
            await cp(args.buildPath, localPath, { recursive: true });
            logger.info(`Cache UPLOADED: ${cacheKey}`);
            return localPath;
        }
        catch (error) {
            logger.error("Failed to upload build cache", error);
            return null;
        }
    },
};
/**
 * Resolves the Metro/React Native entry file (Expo often uses index.ts or index.js, not index.android.js).
 */
async function resolveEntryFile(projectRoot, platform) {
    const candidates = [];
    try {
        const pkgPath = path.join(projectRoot, "package.json");
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
        if (pkg.main)
            candidates.push(pkg.main);
    }
    catch { }
    candidates.push("index.ts", "index.tsx", "index.js", "index.jsx");
    if (platform === "android")
        candidates.push("index.android.js", "index.android.ts");
    for (const name of candidates) {
        const full = path.join(projectRoot, name);
        try {
            await stat(full);
            return name;
        }
        catch { }
    }
    return "index.js";
}
/**
 * Generates a JavaScript bundle using Expo/Metro.
 * Exported for use by root expo-cache-provider when enableRepack is true.
 */
export async function generateJSBundle(projectRoot, platform) {
    const tempBundle = path.join(tmpdir(), `jsbundle-${Date.now()}.${platform === "android" ? "android.bundle" : "jsbundle"}`);
    try {
        // Try Expo export:embed first
        try {
            execSync(`npx expo export:embed --platform ${platform}`, {
                cwd: projectRoot,
                stdio: "pipe",
                timeout: 60000, // 60 second timeout
            });
            // Find the generated bundle
            const possiblePaths = [
                path.join(projectRoot, ".expo", "bundles", platform === "android" ? "index.android.bundle" : "main.jsbundle"),
                path.join(projectRoot, "dist", platform === "android" ? "index.android.bundle" : "main.jsbundle"),
            ];
            for (const bundlePath of possiblePaths) {
                try {
                    await stat(bundlePath);
                    return bundlePath;
                }
                catch {
                    // Continue to next path
                }
            }
        }
        catch (error) {
            logger.debug(`Expo export:embed failed, trying Metro directly: ${error}`);
        }
        // Fallback: Use Metro bundler directly (resolve entry from package.json main or default)
        const entryFile = await resolveEntryFile(projectRoot, platform);
        execSync(`npx react-native bundle --platform ${platform} --dev false --entry-file ${entryFile} --bundle-output "${tempBundle}" --assets-dest "${path.dirname(tempBundle)}"`, {
            cwd: projectRoot,
            stdio: "pipe",
            timeout: 60000, // 60 second timeout
        });
        // Verify bundle was created
        await stat(tempBundle);
        return tempBundle;
    }
    catch (error) {
        throw new Error(`Failed to generate JS bundle: ${error}`);
    }
}
export { Repack } from "./repack/Repack.js";
export default NativeCacheProvider;
//# sourceMappingURL=index.js.map