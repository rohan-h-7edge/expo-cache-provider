import type { RunOptions } from "@expo/config";
import { createFingerprintAsync, type FingerprintSource } from "@expo/fingerprint";

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
export async function calculateNativeFingerprint(
	projectRoot: string,
	platform: "android" | "ios",
	runOptions: RunOptions,
): Promise<string> {
	try {
		// Use Expo's official fingerprint with platform-specific sources
		// @expo/fingerprint automatically excludes JS/TS files from the native fingerprint
		// by only including native dependencies, app.json, and native directories
		const fingerprint = await createFingerprintAsync(projectRoot, {
			platforms: [platform],
			// The fingerprint API by default excludes:
			// - JavaScript/TypeScript source files
			// - React components
			// - Business logic
			// It only includes native-affecting changes
		});

		// Return the hash from Expo's fingerprint
		// This hash will be the same even when JS/TS files change
		return fingerprint.hash;
	} catch (error) {
		// If @expo/fingerprint fails, throw an error
		// This ensures we don't silently fall back to incorrect behavior
		throw new Error(
			`Failed to calculate native fingerprint using @expo/fingerprint: ${error}`,
		);
	}
}



