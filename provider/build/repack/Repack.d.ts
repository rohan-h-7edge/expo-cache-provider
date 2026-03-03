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
    private static replaceJsBundle;
    private static extractZip;
    /**
     * Creates a ZIP file from all files in a directory.
     *
     * APK is a ZIP file with specific requirements:
     * - Must not compress certain files (like .so native libraries)
     * - Must preserve file permissions
     * - Must use store (no compression) for .so, .dex files
     */
    private static createZipFromDir;
    /**
     * Aligns an APK (required before signing).
     * APK must be 4-byte aligned for memory mapping; zipalign must run before signing.
     */
    private static alignApk;
    private static findAndroidSdkTool;
    private static findZipalign;
    private static findApksigner;
    /**
     * Signs an Android APK with debug keystore.
     * Supports APK signing v1, v2, and v3.
     */
    private static signApk;
    /**
     * Signs an iOS app bundle.
     *
     * Signing order: main executable → Frameworks → PlugIns → WatchKit extensions → .app bundle
     * Ad-hoc signing works for simulator and development; device deployment requires proper certificates.
     */
    private static signIOSApp;
    private static generateDebugKeystore;
    private static copyFile;
    private static copyDirectory;
    private static fileExists;
    private static findFiles;
    private static removeCodeSignatures;
    private static cleanup;
}
//# sourceMappingURL=Repack.d.ts.map