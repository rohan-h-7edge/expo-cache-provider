import { getPackageJson } from "@expo/config";
const NATIVE_CACHE_PREFIX = "expo-native-cache";
/**
 * Checks if a package has expo-dev-client as a dependency.
 */
function hasDirectDevClientDependency(projectRoot) {
    try {
        const { dependencies = {}, devDependencies = {} } = getPackageJson(projectRoot);
        return !!dependencies["expo-dev-client"] || !!devDependencies["expo-dev-client"];
    }
    catch {
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
export function detectProfile(runOptions, projectRoot) {
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
export function shouldUseCache(profile) {
    return profile !== "production";
}
/**
 * Builds a cache key: `expo-native-cache/<profile>/<platform>/<fingerprint>.<ext>`
 */
export function buildCacheKey(profile, platform, fingerprint) {
    const extension = platform === "ios" ? "app" : "apk";
    return `${NATIVE_CACHE_PREFIX}/${profile}/${platform}/${fingerprint}.${extension}`;
}
//# sourceMappingURL=guards.js.map