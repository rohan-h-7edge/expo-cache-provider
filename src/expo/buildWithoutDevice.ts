import { getConfig } from "@expo/config";
import { createProjectHashAsync } from "@expo/fingerprint";
import type { ResolveBuildCacheProps, RunOptions } from "@expo/config";
import { execSync } from "node:child_process";
import path from "node:path";
import type { HybridCacheConfig } from "../types/CacheTypes.js";
import ExpoCacheProvider from "./index.js";
import { logger } from "../utils/logger.js";

export type BuildAndroidWithoutDeviceOptions = {
	/** Android build variant. Default: "release" */
	variant?: "debug" | "release";
};

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
	const config = getConfig(projectRoot, { skipSDKVersionRequirement: true });
	const exp = config.exp;

	const buildCacheProvider = exp?.buildCacheProvider;
	const isOurPlugin =
		typeof buildCacheProvider === "object" &&
		buildCacheProvider !== null &&
		"plugin" in buildCacheProvider &&
		buildCacheProvider.plugin === "expo-cache-provider";

	const pluginOptions: Partial<HybridCacheConfig> = isOurPlugin
		? (buildCacheProvider as { options?: Partial<HybridCacheConfig> }).options ?? {}
		: {};

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
		logger.info(`Build (no device): using cached/repacked binary: ${resolved}`);
		return resolved;
	}

	logger.info(`Build (no device): cache miss, running Gradle assemble${variant === "release" ? "Release" : "Debug"}...`);
	const androidDir = path.join(projectRoot, "android");
	const gradlew = path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
	const task = variant === "release" ? "assembleRelease" : "assembleDebug";
	execSync(`"${gradlew}" ${task}`, {
		cwd: androidDir,
		stdio: "inherit",
		env: process.env,
	});

	const apkDir = path.join(androidDir, "app", "build", "outputs", "apk", variant);
	const apkName = variant === "release" ? "app-release.apk" : "app-debug.apk";
	const buildPath = path.join(apkDir, apkName);

	await ExpoCacheProvider.uploadBuildCache(
		{ ...resolveArgs, buildPath },
		pluginOptions,
	);
	logger.info(`Build (no device): uploaded to cache, APK: ${buildPath}`);
	return buildPath;
}
