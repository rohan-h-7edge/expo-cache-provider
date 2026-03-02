import { readFile, writeFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { logger } from "../utils/logger.js";
import { execSync } from "node:child_process";
/**
 * Repacks a native binary with a new JavaScript bundle.
 *
 * For Android: Extracts APK, replaces JS bundle, re-signs, repackages
 * For iOS: Extracts .app, replaces JS bundle, re-signs, repackages
 */
export class Repack {
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
    static async repackAndroid(apkPath, jsBundlePath, outputPath, projectRoot) {
        const tempDir = path.join(tmpdir(), `repack-android-${Date.now()}`);
        try {
            await mkdir(tempDir, { recursive: true });
            // 1. Extract APK (it's a ZIP file)
            logger.debug(`Extracting APK: ${apkPath}`);
            await this.extractZip(apkPath, tempDir);
            // 2. Find and replace JavaScript bundle (try all possible locations)
            // Edge case: Bundle location varies by Expo SDK version and build configuration
            const possibleBundlePaths = [
                // Standard React Native locations
                path.join(tempDir, "assets", "index.android.bundle"),
                path.join(tempDir, "assets", "index.bundle"),
                // Expo SDK 50+ locations (new architecture)
                path.join(tempDir, "assets", "_expo", "static", "js", "android", "index.android.bundle"),
                path.join(tempDir, "assets", "_expo", "static", "js", "android", "index.bundle"),
                // Expo SDK <50 locations
                path.join(tempDir, "assets", "_expo", "index.android.bundle"),
                // Alternative locations
                path.join(tempDir, "assets", "js", "index.android.bundle"),
                path.join(tempDir, "assets", "js", "index.bundle"),
                // Hermes bytecode locations (if using Hermes)
                path.join(tempDir, "assets", "index.android.hbc"),
            ];
            let bundleReplaced = false;
            // First, try to find existing bundle location
            for (const bundleDest of possibleBundlePaths) {
                if (await this.fileExists(bundleDest)) {
                    // Backup original bundle size for logging
                    const originalStats = await stat(bundleDest);
                    await this.copyFile(jsBundlePath, bundleDest);
                    const newStats = await stat(bundleDest);
                    logger.debug(`Replaced JS bundle: ${bundleDest} (${originalStats.size} -> ${newStats.size} bytes)`);
                    bundleReplaced = true;
                    break;
                }
            }
            if (!bundleReplaced) {
                // Fallback: create in standard location
                const bundleDest = path.join(tempDir, "assets", "index.android.bundle");
                await mkdir(path.dirname(bundleDest), { recursive: true });
                await this.copyFile(jsBundlePath, bundleDest);
                logger.debug(`Created JS bundle in standard location: ${bundleDest}`);
            }
            // 3. Remove old signatures completely (META-INF directory)
            // This is critical - old signatures must be removed before re-signing
            const metaInfPath = path.join(tempDir, "META-INF");
            if (await this.fileExists(metaInfPath)) {
                await this.cleanup(metaInfPath);
                logger.debug("Removed old META-INF signatures");
            }
            // 4. Verify APK structure before repackaging
            // Edge case: Ensure critical files exist
            const criticalFiles = [
                path.join(tempDir, "AndroidManifest.xml"),
                path.join(tempDir, "classes.dex"), // May be classes.dex, classes2.dex, etc.
            ];
            let hasManifest = false;
            let hasDex = false;
            for (const file of criticalFiles) {
                if (await this.fileExists(file)) {
                    if (file.includes("AndroidManifest"))
                        hasManifest = true;
                    if (file.includes("classes"))
                        hasDex = true;
                }
            }
            // Check for classes2.dex, classes3.dex, etc. (multi-dex)
            const dexFiles = await this.findFiles(tempDir, /^classes\d*\.dex$/);
            if (dexFiles.length > 0)
                hasDex = true;
            if (!hasManifest) {
                throw new Error("APK structure invalid: AndroidManifest.xml not found");
            }
            if (!hasDex) {
                logger.warn("No DEX files found - APK may be AAB or have unusual structure");
            }
            // 5. Repackage APK (include all files in extracted directory)
            // Preserve file permissions by using zip with proper flags
            const unsignedApk = path.join(tempDir, "unsigned.apk");
            await this.createZipFromDir(tempDir, unsignedApk);
            // 6. Align APK (REQUIRED before signing - Android enforces this)
            // Alignment must be 4-byte aligned for memory mapping
            const alignedApk = path.join(tempDir, "aligned.apk");
            await this.alignApk(unsignedApk, alignedApk);
            // 7. Re-sign APK with debug keystore (supports v1, v2, v3 signing)
            await this.signApk(alignedApk, outputPath, projectRoot);
            // Cleanup
            await this.cleanup(tempDir);
            logger.info(`Repacked Android APK: ${outputPath}`);
            return outputPath;
        }
        catch (error) {
            await this.cleanup(tempDir).catch(() => { });
            throw new Error(`Failed to repack Android APK: ${error}`);
        }
    }
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
    static async repackIOS(appPath, jsBundlePath, outputPath, projectRoot) {
        const tempDir = path.join(tmpdir(), `repack-ios-${Date.now()}`);
        try {
            await mkdir(tempDir, { recursive: true });
            const tempAppPath = path.join(tempDir, path.basename(appPath));
            // 1. Copy .app bundle (preserving structure)
            await this.copyDirectory(appPath, tempAppPath);
            // 2. Find and replace JavaScript bundle (try all possible locations)
            const possibleBundlePaths = [
                // Standard locations
                path.join(tempAppPath, "main.jsbundle"),
                path.join(tempAppPath, "index.ios.bundle"),
                path.join(tempAppPath, "index.bundle"),
                // Expo SDK 50+ locations
                path.join(tempAppPath, "_expo", "static", "js", "ios", "main.jsbundle"),
                path.join(tempAppPath, "_expo", "static", "js", "ios", "index.ios.bundle"),
                // Alternative locations
                path.join(tempAppPath, "js", "main.jsbundle"),
                path.join(tempAppPath, "js", "index.ios.bundle"),
            ];
            let bundleReplaced = false;
            // First, try to find existing bundle location
            for (const bundleDest of possibleBundlePaths) {
                if (await this.fileExists(bundleDest)) {
                    // Backup original bundle size for logging
                    const originalStats = await stat(bundleDest);
                    await this.copyFile(jsBundlePath, bundleDest);
                    const newStats = await stat(bundleDest);
                    logger.debug(`Replaced JS bundle: ${bundleDest} (${originalStats.size} -> ${newStats.size} bytes)`);
                    bundleReplaced = true;
                    break;
                }
            }
            if (!bundleReplaced) {
                // Fallback: create in standard location
                const bundleDest = path.join(tempAppPath, "main.jsbundle");
                await this.copyFile(jsBundlePath, bundleDest);
                logger.debug(`Created JS bundle in standard location: ${bundleDest}`);
            }
            // 3. Verify .app bundle structure
            // Edge case: Ensure critical files exist
            const infoPlistPath = path.join(tempAppPath, "Info.plist");
            if (!(await this.fileExists(infoPlistPath))) {
                logger.warn("Info.plist not found - app bundle may be invalid");
            }
            // Find main executable (varies by app name)
            const executables = await this.findFiles(tempAppPath, /^[^.]*$/);
            const mainExecutable = executables.find(exe => {
                const exePath = path.join(tempAppPath, exe);
                return !exe.includes(".") && !exe.includes("/");
            });
            if (!mainExecutable) {
                logger.warn("Main executable not found - app may not launch");
            }
            // 4. Remove old code signatures (critical for re-signing)
            // iOS apps have _CodeSignature directory that must be removed
            const codeSignaturePath = path.join(tempAppPath, "_CodeSignature");
            if (await this.fileExists(codeSignaturePath)) {
                await this.cleanup(codeSignaturePath);
                logger.debug("Removed old _CodeSignature");
            }
            // Also remove embedded code signatures from frameworks/plugins
            await this.removeCodeSignatures(tempAppPath);
            // 5. Re-sign the app bundle
            // This must sign: main executable, frameworks, plugins, and the bundle itself
            try {
                await this.signIOSApp(tempAppPath, projectRoot);
            }
            catch (error) {
                logger.warn(`Failed to re-sign iOS app, continuing without signing: ${error}`);
                logger.warn("Unsigned app may not work on devices, but will work in simulator");
            }
            // 6. Copy to output
            await mkdir(path.dirname(outputPath), { recursive: true });
            await this.copyDirectory(tempAppPath, outputPath);
            // Cleanup
            await this.cleanup(tempDir);
            logger.info(`Repacked iOS app: ${outputPath}`);
            return outputPath;
        }
        catch (error) {
            await this.cleanup(tempDir).catch(() => { });
            throw new Error(`Failed to repack iOS app: ${error}`);
        }
    }
    /**
     * Extracts a ZIP file (APK).
     */
    static async extractZip(zipPath, destDir) {
        // Use unzip command if available, otherwise use Node.js zip library
        try {
            execSync(`unzip -q "${zipPath}" -d "${destDir}"`, { stdio: "ignore" });
        }
        catch {
            // Fallback: try using adm-zip or similar
            throw new Error("unzip command not available. Please install unzip.");
        }
    }
    /**
     * Creates a ZIP file from all files in a directory.
     *
     * Important: APK is a ZIP file with specific requirements:
     * - Must not compress certain files (like .so native libraries)
     * - Must preserve file permissions
     * - Must use store (no compression) for .so, .dex files
     */
    static async createZipFromDir(sourceDir, zipPath) {
        try {
            // Use zip with store method for native libraries and dex files
            // -0: store files without compression (faster, required for some files)
            // -q: quiet mode
            // -r: recursive
            // -X: don't save extra file attributes (prevents permission issues)
            execSync(`cd "${sourceDir}" && zip -0 -q -r -X "${zipPath}" .`, {
                stdio: "ignore",
                timeout: 60000,
            });
            logger.debug(`Created APK ZIP: ${zipPath}`);
        }
        catch (error) {
            throw new Error(`Failed to create APK: zip command not available or failed. Please install zip. Error: ${error}`);
        }
    }
    /**
     * Aligns an APK (required before signing).
     *
     * APK alignment is CRITICAL:
     * - Must be 4-byte aligned for memory mapping
     * - Unaligned APKs may fail to install or run
     * - zipalign must run before signing
     */
    static async alignApk(inputApk, outputApk) {
        const zipalignPath = this.findZipalign();
        if (!zipalignPath) {
            logger.warn("zipalign not found, skipping alignment");
            logger.warn("WARNING: Unaligned APK may fail to install or run on some devices");
            await this.copyFile(inputApk, outputApk);
            return;
        }
        try {
            // -f: force overwrite
            // -p: page align shared libraries (4-byte alignment)
            // -v: verify alignment (optional, for debugging)
            execSync(`"${zipalignPath}" -f -p 4 "${inputApk}" "${outputApk}"`, {
                stdio: "ignore",
                timeout: 30000,
            });
            // Verify alignment
            try {
                execSync(`"${zipalignPath}" -v 4 "${outputApk}"`, {
                    stdio: "pipe",
                    timeout: 10000,
                });
                logger.debug("APK alignment verified");
            }
            catch {
                logger.warn("APK alignment verification failed, but continuing");
            }
        }
        catch (error) {
            logger.warn(`zipalign failed: ${error}`);
            logger.warn("Using unaligned APK (may cause issues)");
            await this.copyFile(inputApk, outputApk);
        }
    }
    /**
     * Finds zipalign tool.
     */
    static findZipalign() {
        const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
        if (!androidHome) {
            return null;
        }
        try {
            const result = execSync(`find "${androidHome}/build-tools" -name "zipalign" 2>/dev/null | head -1`, { encoding: "utf-8" });
            return result.trim() || null;
        }
        catch {
            return null;
        }
    }
    /**
     * Signs an Android APK with debug keystore.
     * Supports APK signing v1, v2, and v3.
     */
    static async signApk(apkPath, outputPath, projectRoot) {
        // Try to find debug keystore in multiple locations
        const possibleKeystores = [
            path.join(projectRoot, "android", "app", "debug.keystore"),
            path.join(process.env.HOME || "", ".android", "debug.keystore"),
            path.join(process.env.ANDROID_HOME || "", "debug.keystore"),
        ];
        let keystorePath = null;
        for (const keystore of possibleKeystores) {
            if (await this.fileExists(keystore)) {
                keystorePath = keystore;
                break;
            }
        }
        if (!keystorePath) {
            // Generate debug keystore if it doesn't exist
            logger.warn("Debug keystore not found, generating one...");
            keystorePath = possibleKeystores[1]; // Use default location
            await this.generateDebugKeystore(keystorePath);
        }
        // Sign with apksigner (preferred - supports v1, v2, v3)
        try {
            const apksignerPath = this.findApksigner();
            if (apksignerPath) {
                // Use v1, v2, v3 signing schemes for maximum compatibility
                try {
                    // --min-sdk-version: required when manifest is missing or not binary XML (e.g. minimal/test APKs)
                    execSync(`"${apksignerPath}" sign --ks "${keystorePath}" --ks-pass pass:android --key-pass pass:android --min-sdk-version 21 --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true "${apkPath}"`, {
                        encoding: "utf-8",
                        timeout: 30000,
                    });
                }
                catch (signError) {
                    const err = signError;
                    const stderr = err?.stderr ?? (err?.message ?? String(signError));
                    throw new Error(`apksigner failed: ${stderr}`);
                }
                await this.copyFile(apkPath, outputPath);
                logger.debug("APK signed with apksigner (v1+v2+v3)");
                return;
            }
            // Fallback to jarsigner (v1 only, but more widely available)
            logger.warn("apksigner not found, using jarsigner (v1 signing only)");
            execSync(`jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore "${keystorePath}" -storepass android -keypass android "${apkPath}" androiddebugkey`, {
                stdio: "ignore",
                timeout: 30000,
            });
            await this.copyFile(apkPath, outputPath);
            logger.debug("APK signed with jarsigner (v1)");
        }
        catch (error) {
            throw new Error(`Failed to sign APK: ${error}. Make sure Android SDK tools are installed.`);
        }
    }
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
    static async signIOSApp(appPath, projectRoot) {
        try {
            // 1. Sign embedded frameworks first (if any)
            // Edge case: Frameworks may contain nested frameworks
            const frameworksPath = path.join(appPath, "Frameworks");
            if (await this.fileExists(frameworksPath)) {
                const frameworks = await readdir(frameworksPath);
                for (const framework of frameworks) {
                    if (framework.endsWith(".framework")) {
                        const frameworkPath = path.join(frameworksPath, framework);
                        // Sign nested frameworks first (if any)
                        const nestedFrameworksPath = path.join(frameworkPath, "Frameworks");
                        if (await this.fileExists(nestedFrameworksPath)) {
                            const nestedFrameworks = await readdir(nestedFrameworksPath);
                            for (const nested of nestedFrameworks) {
                                if (nested.endsWith(".framework")) {
                                    const nestedPath = path.join(nestedFrameworksPath, nested);
                                    try {
                                        execSync(`codesign --force --sign - "${nestedPath}"`, {
                                            stdio: "ignore",
                                            timeout: 10000,
                                        });
                                        logger.debug(`Signed nested framework: ${nested}`);
                                    }
                                    catch (error) {
                                        logger.warn(`Failed to sign nested framework ${nested}: ${error}`);
                                    }
                                }
                            }
                        }
                        // Sign the framework itself
                        try {
                            execSync(`codesign --force --sign - "${frameworkPath}"`, {
                                stdio: "ignore",
                                timeout: 10000,
                            });
                            logger.debug(`Signed framework: ${framework}`);
                        }
                        catch (error) {
                            logger.warn(`Failed to sign framework ${framework}: ${error}`);
                        }
                    }
                }
            }
            // 2. Sign embedded plugins (if any)
            // Edge case: PlugIns may have their own frameworks
            const pluginsPath = path.join(appPath, "PlugIns");
            if (await this.fileExists(pluginsPath)) {
                const plugins = await readdir(pluginsPath);
                for (const plugin of plugins) {
                    if (plugin.endsWith(".appex")) {
                        const pluginPath = path.join(pluginsPath, plugin);
                        // Sign plugin's frameworks first
                        const pluginFrameworksPath = path.join(pluginPath, "Frameworks");
                        if (await this.fileExists(pluginFrameworksPath)) {
                            const pluginFrameworks = await readdir(pluginFrameworksPath);
                            for (const framework of pluginFrameworks) {
                                if (framework.endsWith(".framework")) {
                                    const frameworkPath = path.join(pluginFrameworksPath, framework);
                                    try {
                                        execSync(`codesign --force --sign - "${frameworkPath}"`, {
                                            stdio: "ignore",
                                            timeout: 10000,
                                        });
                                    }
                                    catch (error) {
                                        logger.warn(`Failed to sign plugin framework ${framework}: ${error}`);
                                    }
                                }
                            }
                        }
                        // Sign the plugin itself
                        try {
                            execSync(`codesign --force --sign - "${pluginPath}"`, {
                                stdio: "ignore",
                                timeout: 10000,
                            });
                            logger.debug(`Signed plugin: ${plugin}`);
                        }
                        catch (error) {
                            logger.warn(`Failed to sign plugin ${plugin}: ${error}`);
                        }
                    }
                }
            }
            // 3. Sign WatchKit extensions (if any)
            // Edge case: WatchKit apps have separate signing requirements
            const watchPath = path.join(appPath, "Watch");
            if (await this.fileExists(watchPath)) {
                const watchApps = await readdir(watchPath);
                for (const watchApp of watchApps) {
                    if (watchApp.endsWith(".app")) {
                        const watchAppPath = path.join(watchPath, watchApp);
                        try {
                            await this.signIOSApp(watchAppPath, projectRoot); // Recursive
                            logger.debug(`Signed WatchKit app: ${watchApp}`);
                        }
                        catch (error) {
                            logger.warn(`Failed to sign WatchKit app ${watchApp}: ${error}`);
                        }
                    }
                }
            }
            // 4. Sign the main app bundle
            // Use ad-hoc signing (-) which works for simulator and development
            // For device deployment, proper certificates are needed
            // --deep flag ensures nested code is signed
            execSync(`codesign --force --deep --sign - "${appPath}"`, {
                stdio: "ignore",
                timeout: 30000, // 30 second timeout for complex apps
            });
            logger.debug("iOS app signed with ad-hoc signature");
        }
        catch (error) {
            // Ad-hoc signing failed - app may still work in simulator
            logger.warn(`iOS app signing failed: ${error}`);
            logger.warn("App may work in simulator but not on physical devices without proper certificates");
        }
    }
    /**
     * Finds apksigner tool.
     */
    static findApksigner() {
        const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
        if (!androidHome) {
            return null;
        }
        const possiblePaths = [
            path.join(androidHome, "build-tools", "*", "apksigner"),
            path.join(androidHome, "build-tools", "*", "apksigner.bat"),
        ];
        // Try to find latest version
        try {
            const result = execSync(`find "${androidHome}/build-tools" -name "apksigner" 2>/dev/null | head -1`, { encoding: "utf-8" });
            return result.trim() || null;
        }
        catch {
            return null;
        }
    }
    /**
     * Generates a debug keystore.
     */
    static async generateDebugKeystore(keystorePath) {
        await mkdir(path.dirname(keystorePath), { recursive: true });
        execSync(`keytool -genkey -v -keystore "${keystorePath}" -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US"`, { stdio: "ignore" });
    }
    /**
     * Helper: Copy file.
     */
    static async copyFile(src, dest) {
        await mkdir(path.dirname(dest), { recursive: true });
        const data = await readFile(src);
        await writeFile(dest, data);
    }
    /**
     * Helper: Copy directory recursively.
     */
    static async copyDirectory(src, dest) {
        await mkdir(dest, { recursive: true });
        const entries = await readdir(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            }
            else {
                await this.copyFile(srcPath, destPath);
            }
        }
    }
    /**
     * Helper: Check if file exists.
     */
    static async fileExists(filePath) {
        try {
            await stat(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Helper: Find files matching a pattern.
     */
    static async findFiles(dir, pattern) {
        const files = [];
        try {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const subFiles = await this.findFiles(fullPath, pattern);
                    files.push(...subFiles.map(f => path.join(entry.name, f)));
                }
                else if (pattern.test(entry.name)) {
                    files.push(entry.name);
                }
            }
        }
        catch {
            // Ignore errors
        }
        return files;
    }
    /**
     * Removes code signatures from iOS app bundle recursively.
     */
    static async removeCodeSignatures(appPath) {
        // Remove _CodeSignature from frameworks
        const frameworksPath = path.join(appPath, "Frameworks");
        if (await this.fileExists(frameworksPath)) {
            const frameworks = await readdir(frameworksPath);
            for (const framework of frameworks) {
                if (framework.endsWith(".framework")) {
                    const codeSigPath = path.join(frameworksPath, framework, "_CodeSignature");
                    if (await this.fileExists(codeSigPath)) {
                        await this.cleanup(codeSigPath);
                        logger.debug(`Removed _CodeSignature from framework: ${framework}`);
                    }
                }
            }
        }
        // Remove _CodeSignature from plugins
        const pluginsPath = path.join(appPath, "PlugIns");
        if (await this.fileExists(pluginsPath)) {
            const plugins = await readdir(pluginsPath);
            for (const plugin of plugins) {
                if (plugin.endsWith(".appex")) {
                    const codeSigPath = path.join(pluginsPath, plugin, "_CodeSignature");
                    if (await this.fileExists(codeSigPath)) {
                        await this.cleanup(codeSigPath);
                        logger.debug(`Removed _CodeSignature from plugin: ${plugin}`);
                    }
                }
            }
        }
    }
    /**
     * Helper: Cleanup temporary directory.
     */
    static async cleanup(dir) {
        try {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await this.cleanup(fullPath);
                }
                else {
                    await unlink(fullPath);
                }
            }
            await unlink(dir).catch(() => { });
        }
        catch {
            // Ignore cleanup errors
        }
    }
}
//# sourceMappingURL=Repack.js.map