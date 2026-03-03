import { getConfig } from "@expo/config";
import { createProjectHashAsync } from "@expo/fingerprint";
import type { ResolveBuildCacheProps, RunOptions } from "@expo/config";
import { execSync } from "node:child_process";
import path from "node:path";
import type { HybridCacheConfig } from "../types/CacheTypes.js";
import ExpoCacheProvider from "./index.js";
import { logger } from "../utils/logger.js";

export type BuildAndroidWithoutDeviceOptions = {
	/**
	 * Android Gradle variant. Default: "release".
	 * Accepts simple variants ("release", "debug") or compound Expo variants
	 * like "qaRelease", "developDebug", "preprodRelease".
	 */
	variant?: string;
	/**
	 * Explicit path to the built APK. Overrides auto-detection when your project
	 * uses a non-standard output layout.
	 */
	apkPath?: string;
};

const PLUGIN_NAMES = ["expo-cache-provider", "expo-native-cache-provider"];
const GRADLEW_WIN = "gradlew.bat";
const GRADLEW_UNIX = "gradlew";

/**
 * Converts a variant string to its Gradle assemble task.
 * "release" → "assembleRelease", "qaRelease" → "assembleQaRelease"
 */
function gradleTask(variant: string): string {
	return `assemble${variant.charAt(0).toUpperCase()}${variant.slice(1)}`;
}

/**
 * Resolves the expected APK output path for a given variant.
 * Simple:   "release"      → apk/release/app-release.apk
 * Compound: "qaRelease"    → apk/qa/release/app-qa-release.apk
 *           "developDebug" → apk/develop/debug/app-develop-debug.apk
 */
function apkOutputPath(androidDir: string, variant: string): string {
	const buildType = variant.endsWith("Release") ? "release" : variant.endsWith("Debug") ? "debug" : "release";
	const flavor = buildType === "release" ? variant.slice(0, -7) : variant.slice(0, -5);
	if (!flavor) {
		return path.join(androidDir, "app", "build", "outputs", "apk", buildType, `app-${buildType}.apk`);
	}
	return path.join(androidDir, "app", "build", "outputs", "apk", flavor, buildType, `app-${flavor}-${buildType}.apk`);
}

function resolvePluginOptions(projectRoot: string): Partial<HybridCacheConfig> {
	const { exp } = getConfig(projectRoot, { skipSDKVersionRequirement: true });
	const buildCacheProvider = exp?.buildCacheProvider;
	const isOurPlugin =
		typeof buildCacheProvider === "object" &&
		buildCacheProvider !== null &&
		"plugin" in buildCacheProvider &&
		PLUGIN_NAMES.includes(buildCacheProvider.plugin as string);
	return isOurPlugin
		? (buildCacheProvider as { options?: Partial<HybridCacheConfig> }).options ?? {}
		: {};
}

function runGradleBuild(androidDir: string, variant: string): void {
	const gradlew = path.join(androidDir, process.platform === "win32" ? GRADLEW_WIN : GRADLEW_UNIX);
	execSync(`"${gradlew}" ${gradleTask(variant)}`, {
		cwd: androidDir,
		stdio: "inherit",
		env: process.env,
	});
}

/**
 * Runs the same cache + (optional) Gradle build flow as `expo run:android`,
 * but without requiring a connected device or emulator.
 * Use this in CI or when you only need the APK path (e.g. for artifact upload).
 *
 * 1. Resolves build cache (cache hit → optional repack → return path).
 * 2. On cache miss: runs Gradle (assembleRelease/assembleDebug), uploads to cache, returns APK path.
 *
 * Requires the project to use this plugin in app config (buildCacheProvider.plugin === "expo-cache-provider").
 *
 * @param projectRoot - Project root (directory containing app.config.js and android/)
 * @param options - Optional variant (default "release")
 * @returns Path to the APK (cached/repacked or freshly built)
 */
export async function buildAndroidWithoutDevice(
	projectRoot: string,
	options?: BuildAndroidWithoutDeviceOptions,
): Promise<string> {
	const variant = options?.variant ?? "release";
	const pluginOptions = resolvePluginOptions(projectRoot);
	const fingerprintHash = await createProjectHashAsync(projectRoot);
	const runOptions: RunOptions = { variant };

	const resolveArgs: ResolveBuildCacheProps = {
		projectRoot,
		platform: "android",
		fingerprintHash,
		runOptions,
	};

	const resolved = await ExpoCacheProvider.resolveBuildCache(resolveArgs, pluginOptions);
	if (resolved !== null) {
		logger.info(`Build (no device): cache hit`);
		return resolved;
	}

	const androidDir = path.join(projectRoot, "android");
	logger.info(`Build (no device): cache miss, running Gradle ${gradleTask(variant)}...`);
	runGradleBuild(androidDir, variant);

	const buildPath = options?.apkPath ? path.resolve(options.apkPath) : apkOutputPath(androidDir, variant);

	await ExpoCacheProvider.uploadBuildCache({ ...resolveArgs, buildPath }, pluginOptions);
	logger.info(`Build (no device): uploaded to cache`);
	return buildPath;
}
