import type { RunOptions } from "@expo/config";
/**
 * Calculates a native-only fingerprint hash using @expo/fingerprint.
 *
 * Only native-affecting changes (SDK version, native directories, app.json,
 * native module versions) are included. JS/TS source files are excluded,
 * so the hash stays stable on JS-only changes.
 */
export declare function calculateNativeFingerprint(projectRoot: string, platform: "android" | "ios", runOptions: RunOptions): Promise<string>;
//# sourceMappingURL=nativeFingerprint.d.ts.map