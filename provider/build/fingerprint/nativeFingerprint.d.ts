import type { RunOptions } from "@expo/config";
/**
 * Creates a native-only fingerprint using Expo's official @expo/fingerprint.
 *
 * This excludes JavaScript/TypeScript source files to ensure cache hits
 * when only JS changes occur.
 */
/**
 * Calculates a native-only fingerprint hash using Expo's official @expo/fingerprint.
 *
 * Uses Expo's fingerprinting with custom sources that exclude JS/TS files.
 * This ensures cache hits when only JavaScript changes occur.
 *
 * Includes:
 * - Expo SDK version
 * - Platform-specific native code
 * - Native directories (android/ or ios/)
 * - Native-affecting app.json fields
 * - Native module versions
 *
 * Excludes:
 * - JS/TS source files (src/, app/, components/, etc.)
 * - React components
 * - Business logic
 */
export declare function calculateNativeFingerprint(projectRoot: string, platform: "android" | "ios", runOptions: RunOptions): Promise<string>;
//# sourceMappingURL=nativeFingerprint.d.ts.map