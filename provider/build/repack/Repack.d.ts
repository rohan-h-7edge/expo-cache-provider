/**
 * Repacks a native binary with a new JavaScript bundle.
 *
 * For Android: Extracts APK, replaces JS bundle, re-signs, repackages
 * For iOS: Extracts .app, replaces JS bundle, re-signs, repackages
 */
export declare class Repack {
    /**
     * Repacks an Android APK with a new JavaScript bundle.
     *
     * Edge cases handled:
     * - Multiple bundle locations (Expo SDK variations)
     * - Split APKs (base.apk only)
     * - Different native architectures
     * - APK signing v1/v2/v3
     * - File permissions preservation
     */
    static repackAndroid(apkPath: string, jsBundlePath: string, outputPath: string, projectRoot: string): Promise<string>;
    /**
     * Repacks an iOS .app bundle with a new JavaScript bundle.
     *
     * Edge cases handled:
     * - Multiple bundle locations (Expo SDK variations)
     * - Code signing with entitlements
     * - Frameworks and PlugIns signing
     * - Info.plist updates
     * - Embedded frameworks preservation
     */
    static repackIOS(appPath: string, jsBundlePath: string, outputPath: string, projectRoot: string): Promise<string>;
    /**
     * Extracts a ZIP file (APK).
     */
    private static extractZip;
    /**
     * Creates a ZIP file from all files in a directory.
     *
     * Important: APK is a ZIP file with specific requirements:
     * - Must not compress certain files (like .so native libraries)
     * - Must preserve file permissions
     * - Must use store (no compression) for .so, .dex files
     */
    private static createZipFromDir;
    /**
     * Aligns an APK (required before signing).
     *
     * APK alignment is CRITICAL:
     * - Must be 4-byte aligned for memory mapping
     * - Unaligned APKs may fail to install or run
     * - zipalign must run before signing
     */
    private static alignApk;
    /**
     * Finds zipalign tool.
     */
    private static findZipalign;
    /**
     * Signs an Android APK with debug keystore.
     * Supports APK signing v1, v2, and v3.
     */
    private static signApk;
    /**
     * Signs an iOS app bundle.
     *
     * Edge cases:
     * - Must sign main executable first
     * - Then sign Frameworks/*.framework (recursively)
     * - Then sign PlugIns/*.appex (if any)
     * - Then sign WatchKit extensions (if any)
     * - Finally sign the entire .app bundle
     * - Preserve entitlements if they exist
     * - Handle deep signing (nested frameworks)
     */
    private static signIOSApp;
    /**
     * Finds apksigner tool.
     */
    private static findApksigner;
    /**
     * Generates a debug keystore.
     */
    private static generateDebugKeystore;
    /**
     * Helper: Copy file.
     */
    private static copyFile;
    /**
     * Helper: Copy directory recursively.
     */
    private static copyDirectory;
    /**
     * Helper: Check if file exists.
     */
    private static fileExists;
    /**
     * Helper: Find files matching a pattern.
     */
    private static findFiles;
    /**
     * Removes code signatures from iOS app bundle recursively.
     */
    private static removeCodeSignatures;
    /**
     * Helper: Cleanup temporary directory.
     */
    private static cleanup;
}
//# sourceMappingURL=Repack.d.ts.map