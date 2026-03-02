import type { RunOptions } from "@expo/config";
import { createFingerprintAsync } from "@expo/fingerprint";

/**
 * Calculates a native-only fingerprint hash using @expo/fingerprint.
 *
 * Only native-affecting changes (SDK version, native directories, app.json,
 * native module versions) are included. JS/TS source files are excluded,
 * so the hash stays stable on JS-only changes.
 */
export async function calculateNativeFingerprint(
	projectRoot: string,
	platform: "android" | "ios",
	runOptions: RunOptions,
): Promise<string> {
	try {
		const fingerprint = await createFingerprintAsync(projectRoot, {
			platforms: [platform],
		});
		return fingerprint.hash;
	} catch (error) {
		throw new Error(
			`Failed to calculate native fingerprint using @expo/fingerprint: ${error}`,
		);
	}
}
