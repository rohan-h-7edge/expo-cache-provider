import type { RunOptions } from "@expo/config";
import { getPackageJson } from "@expo/config";
import { logger } from "./logger.js";

export type Profile = "development" | "qa" | "production";

/**
 * Checks if a package has expo-dev-client as a dependency.
 */
function hasDirectDevClientDependency(projectRoot: string): boolean {
	try {
		const { dependencies = {}, devDependencies = {} } = getPackageJson(projectRoot);
		return !!dependencies["expo-dev-client"] || !!devDependencies["expo-dev-client"];
	} catch {
		return false;
	}
}

/**
 * Detects the build profile from runOptions.
 * 
 * Rules:
 * - debug/Debug → development
 * - release/Release + dev-client → qa
 * - release/Release + no dev-client → production
 */
export function detectProfile(
	runOptions: RunOptions,
	projectRoot: string,
): Profile {
	const hasDevClient = hasDirectDevClientDependency(projectRoot);

	// Android
	if ("variant" in runOptions && runOptions.variant !== undefined) {
		if (runOptions.variant === "debug") {
			return "development";
		}
		if (runOptions.variant === "release") {
			return hasDevClient ? "qa" : "production";
		}
	}

	// iOS
	if ("configuration" in runOptions && runOptions.configuration !== undefined) {
		if (runOptions.configuration === "Debug") {
			return "development";
		}
		if (runOptions.configuration === "Release") {
			return hasDevClient ? "qa" : "production";
		}
	}

	// Default: development if dev-client, production otherwise
	return hasDevClient ? "development" : "production";
}

/**
 * Checks if cache should be used for the given profile.
 * Production builds are always blocked.
 */
export function shouldUseCache(profile: Profile): boolean {
	if (profile === "production") {
		logger.warn("Cache SKIP: Production builds are not cached");
		return false;
	}
	return true;
}

/**
 * Builds a cache key in the format: expo-native-cache/<profile>/<platform>/<fingerprint>.<ext>
 */
export function buildCacheKey(
	profile: Profile,
	platform: "android" | "ios",
	fingerprint: string,
): string {
	const extension = platform === "ios" ? "app" : "apk";
	return `expo-native-cache/${profile}/${platform}/${fingerprint}.${extension}`;
}





