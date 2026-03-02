import type { RunOptions } from "@expo/config";
export type Profile = "development" | "qa" | "production";
/**
 * Detects the build profile from runOptions.
 *
 * Rules:
 * - debug/Debug → development
 * - release/Release + dev-client → qa
 * - release/Release + no dev-client → production
 */
export declare function detectProfile(runOptions: RunOptions, projectRoot: string): Profile;
/**
 * Checks if cache should be used for the given profile.
 * Production builds are always blocked.
 */
export declare function shouldUseCache(profile: Profile): boolean;
/**
 * Builds a cache key in the format: expo-native-cache/<profile>/<platform>/<fingerprint>.<ext>
 */
export declare function buildCacheKey(profile: Profile, platform: "android" | "ios", fingerprint: string): string;
//# sourceMappingURL=guards.d.ts.map