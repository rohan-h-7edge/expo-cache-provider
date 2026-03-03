import type {
	BuildCacheProviderPlugin,
	CalculateFingerprintHashProps,
	ResolveBuildCacheProps,
	UploadBuildCacheProps,
} from "@expo/config";
import { readFile, writeFile, cp, mkdir, stat, unlink, access } from "node:fs/promises";
import path from "node:path";
import { create, extract } from "tar";
import { tmpdir } from "node:os";
import { calculateNativeFingerprint } from "./fingerprint/nativeFingerprint.js";
import { detectProfile, shouldUseCache, buildCacheKey } from "./utils/guards.js";
import { HybridCache, type HybridCacheConfig } from "./hybrid/HybridCache.js";
import { logger } from "./utils/logger.js";
import { Repack } from "./repack/Repack.js";
import { execSync } from "node:child_process";
import envPaths from "env-paths";

const packageName = "expo-native-cache-provider";
const BUNDLE_TIMEOUT_MS = 60_000;

function getDefaultCacheDir(): string {
	return path.join(envPaths(packageName, { suffix: "" }).temp, "native-cache");
}

function makeTempFilePath(prefix: string): string {
	return path.join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`);
}

async function withTempFile<T>(prefix: string, fn: (tempPath: string) => Promise<T>): Promise<T> {
	const tempPath = makeTempFilePath(prefix);
	try {
		return await fn(tempPath);
	} finally {
		await unlink(tempPath).catch(() => {});
	}
}

async function createTarballData(sourceDir: string): Promise<Buffer> {
	return withTempFile("native-cache", async (tempFile) => {
		await create({ cwd: path.dirname(sourceDir), file: tempFile, gzip: true }, [path.basename(sourceDir)]);
		return readFile(tempFile);
	});
}

async function extractTarballData(tarballData: Buffer, targetDir: string): Promise<void> {
	await withTempFile("native-cache-extract", async (tempFile) => {
		await mkdir(path.dirname(targetDir), { recursive: true });
		await writeFile(tempFile, tarballData);
		await extract({ cwd: path.dirname(targetDir), file: tempFile, gzip: true });
	});
}

async function readNativeBuildArtifact(buildPath: string): Promise<Buffer> {
	const buildStats = await stat(buildPath);
	return buildStats.isDirectory() ? createTarballData(buildPath) : readFile(buildPath);
}

async function writeNativeCachedArtifact(
	data: Buffer,
	cacheKey: string,
	targetPath: string,
): Promise<void> {
	await mkdir(path.dirname(targetPath), { recursive: true });
	if (cacheKey.endsWith(".app")) {
		await extractTarballData(data, targetPath);
	} else {
		await writeFile(targetPath, data);
	}
}

async function copyBuildToLocalDir(
	buildPath: string,
	cacheKey: string,
	localCacheDir: string,
): Promise<string> {
	const localPath = path.join(localCacheDir, path.basename(cacheKey));
	await mkdir(path.dirname(localPath), { recursive: true });
	await cp(buildPath, localPath, { recursive: true });
	return localPath;
}

async function repackWithFreshJS(
	targetPath: string,
	cacheKey: string,
	args: ResolveBuildCacheProps,
	localCacheDir: string,
): Promise<string | null> {
	try {
		logger.info(`Repacking cached ${args.platform === "android" ? "APK" : "app"} with fresh JS bundle...`);
		logger.info("  → Generating JS bundle...");
		const jsBundlePath = await generateJSBundle(args.projectRoot, args.platform);
		logger.info("  → Injecting bundle into binary...");
		const repackedPath = path.join(localCacheDir, `repacked-${path.basename(cacheKey)}`);
		if (args.platform === "android") {
			await Repack.repackAndroid(targetPath, jsBundlePath, repackedPath, args.projectRoot);
		} else {
			await Repack.repackIOS(targetPath, jsBundlePath, repackedPath, args.projectRoot);
		}
		logger.info("  ✓ Repack complete");
		return repackedPath;
	} catch (error) {
		logger.warn(`Repack failed, using cached binary as-is: ${error}`);
		return null;
	}
}

/**
 * Normalizes configuration with defaults.
 */
function normalizeConfig(options?: Partial<HybridCacheConfig>): HybridCacheConfig {
	const env = process.env;

	return {
		localCacheDir:
			options?.localCacheDir ||
			env.EXPO_NATIVE_CACHE_LOCAL_DIR ||
			getDefaultCacheDir(),
		s3: options?.s3?.bucket
			? {
					bucket: options.s3.bucket,
					region: options.s3.region || env.EXPO_NATIVE_CACHE_S3_REGION || "",
					accessKeyId:
						options.s3.accessKeyId ||
						env.EXPO_NATIVE_CACHE_S3_ACCESS_KEY_ID,
					secretAccessKey:
						options.s3.secretAccessKey ||
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
const NativeCacheProvider: BuildCacheProviderPlugin<
	Partial<HybridCacheConfig> | undefined
> = {
	/**
	 * Custom fingerprint calculation that excludes JS/TS files.
	 */
	async calculateFingerprintHash(
		props: CalculateFingerprintHashProps,
		_options?: Partial<HybridCacheConfig> | undefined,
	): Promise<string | null> {
		try {
			const fingerprint = await calculateNativeFingerprint(
				props.projectRoot,
				props.platform,
				props.runOptions,
			);
			logger.debug(`Calculated native fingerprint: ${fingerprint.slice(0, 16)}...`);
			return fingerprint;
		} catch (error) {
			logger.error("Failed to calculate native fingerprint", error);
			return null;
		}
	},

	async resolveBuildCache(
		args: ResolveBuildCacheProps,
		options?: Partial<HybridCacheConfig> | undefined,
	): Promise<string | null> {
		try {
			const profile = detectProfile(args.runOptions, args.projectRoot);
			if (!shouldUseCache(profile)) {
				logger.info(`Cache SKIP: ${profile} profile not cached`);
				return null;
			}

			const cacheKey = buildCacheKey(profile, args.platform, args.fingerprintHash);
			const config = normalizeConfig(options);
			const cachedData = await new HybridCache(config).get(cacheKey);

			if (cachedData === null) {
				logger.info(`Cache MISS: ${cacheKey}`);
				return null;
			}

			const targetPath = path.join(config.localCacheDir, path.basename(cacheKey));
			await writeNativeCachedArtifact(cachedData, cacheKey, targetPath);

			if (config.enableRepack) {
				const repacked = await repackWithFreshJS(targetPath, cacheKey, args, config.localCacheDir);
				if (repacked !== null) return repacked;
			}

			logger.info(`Cache HIT: ${cacheKey}`);
			return targetPath;
		} catch (error) {
			logger.error("Failed to resolve build cache", error);
			return null;
		}
	},

	async uploadBuildCache(
		args: UploadBuildCacheProps,
		options?: Partial<HybridCacheConfig> | undefined,
	): Promise<string | null> {
		try {
			const profile = detectProfile(args.runOptions, args.projectRoot);
			if (!shouldUseCache(profile)) {
				logger.info(`Cache SKIP: ${profile} profile not cached`);
				return null;
			}

			const cacheKey = buildCacheKey(profile, args.platform, args.fingerprintHash);
			const config = normalizeConfig(options);
			const buildData = await readNativeBuildArtifact(args.buildPath);

			await new HybridCache(config).set(cacheKey, buildData);
			const localPath = await copyBuildToLocalDir(args.buildPath, cacheKey, config.localCacheDir);

			logger.info(`Cache UPLOADED: ${cacheKey}`);
			return localPath;
		} catch (error) {
			logger.error("Failed to upload build cache", error);
			return null;
		}
	},
};

/**
 * Resolves the Metro/React Native entry file (Expo often uses index.ts or index.js, not index.android.js).
 */
async function resolveEntryFile(projectRoot: string, platform: "android" | "ios"): Promise<string> {
	const candidates: string[] = [];
	try {
		const pkgPath = path.join(projectRoot, "package.json");
		const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { main?: string };
		if (pkg.main) candidates.push(pkg.main);
	} catch {}
	candidates.push("index.ts", "index.tsx", "index.js", "index.jsx");
	if (platform === "android") candidates.push("index.android.js", "index.android.ts");
	for (const name of candidates) {
		const full = path.join(projectRoot, name);
		try {
			await stat(full);
			return name;
		} catch {}
	}
	return "index.js";
}

/**
 * Generates a JavaScript bundle using Expo/Metro.
 * Exported for use by root expo-cache-provider when enableRepack is true.
 */
export async function generateJSBundle(projectRoot: string, platform: "android" | "ios"): Promise<string> {
	const bundleExt = platform === "android" ? "android.bundle" : "jsbundle";
	const tempBundle = path.join(tmpdir(), `jsbundle-${Date.now()}.${bundleExt}`);
	const entryFile = await resolveEntryFile(projectRoot, platform);

	try {
		try {
			execSync(
				`npx expo export:embed --platform ${platform} --entry-file ${entryFile} --bundle-output "${tempBundle}" --assets-dest "${path.dirname(tempBundle)}" --dev false`,
				{
					cwd: projectRoot,
					stdio: "pipe",
					timeout: BUNDLE_TIMEOUT_MS,
					env: { ...process.env, NODE_ENV: process.env.NODE_ENV },
				},
			);
			await stat(tempBundle);
			return tempBundle;
		} catch (error) {
			logger.debug(`expo export:embed failed, falling back to react-native bundle: ${error}`);
		}

		const metroConfig = path.join(projectRoot, "metro.config.js");
		const hasMetroConfig = await access(metroConfig).then(() => true).catch(() => false);
		const configFlag = hasMetroConfig ? ` --config "${metroConfig}"` : "";
		execSync(
			`npx react-native bundle --platform ${platform} --dev false --entry-file ${entryFile} --bundle-output "${tempBundle}" --assets-dest "${path.dirname(tempBundle)}"${configFlag}`,
			{
				cwd: projectRoot,
				stdio: "pipe",
				timeout: BUNDLE_TIMEOUT_MS,
				env: { ...process.env, NODE_ENV: process.env.NODE_ENV },
			},
		);

		await stat(tempBundle);
		return tempBundle;
	} catch (error) {
		throw new Error(`Failed to generate JS bundle: ${error}`);
	}
}

export { Repack } from "./repack/Repack.js";
export default NativeCacheProvider;

