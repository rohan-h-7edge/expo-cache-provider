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
    static async repackAndroid(apkPath, jsBundlePath, outputPath, projectRoot, signing) {
        const tempDir = path.join(tmpdir(), `repack-android-${Date.now()}`);
        try {
            await mkdir(tempDir, { recursive: true });
            logger.info("    [1/4] Extracting APK...");
            await this.extractZip(apkPath, tempDir);
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
                // Hermes bytecode
                path.join(tempDir, "assets", "index.android.hbc"),
            ];
            logger.info("    [2/4] Replacing JS bundle...");
            const fallbackBundlePath = path.join(tempDir, "assets", "index.android.bundle");
            await this.replaceJsBundle(jsBundlePath, possibleBundlePaths, fallbackBundlePath);
            // Old signatures must be removed before re-signing
            const metaInfPath = path.join(tempDir, "META-INF");
            if (await this.fileExists(metaInfPath)) {
                await this.cleanup(metaInfPath);
                logger.debug("Removed old META-INF signatures");
            }
            const hasManifest = await this.fileExists(path.join(tempDir, "AndroidManifest.xml"));
            const dexFiles = await this.findFiles(tempDir, /^classes\d*\.dex$/);
            if (!hasManifest) {
                throw new Error("APK structure invalid: AndroidManifest.xml not found");
            }
            if (dexFiles.length === 0) {
                logger.warn("No DEX files found - APK may be AAB or have unusual structure");
            }
            logger.info("    [3/4] Packaging APK...");
            const unsignedApk = path.join(tempDir, "unsigned.apk");
            await this.createZipFromDir(tempDir, unsignedApk);
            const alignedApk = path.join(tempDir, "aligned.apk");
            await this.alignApk(unsignedApk, alignedApk);
            logger.info("    [4/4] Signing APK...");
            await this.signApk(alignedApk, outputPath, projectRoot, signing);
            await this.cleanup(tempDir);
            logger.debug(`Repacked Android APK: ${outputPath}`);
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
    static async repackIOS(appPath, jsBundlePath, outputPath, projectRoot, signing) {
        const tempDir = path.join(tmpdir(), `repack-ios-${Date.now()}`);
        try {
            await mkdir(tempDir, { recursive: true });
            const tempAppPath = path.join(tempDir, path.basename(appPath));
            await this.copyDirectory(appPath, tempAppPath);
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
            const fallbackBundlePath = path.join(tempAppPath, "main.jsbundle");
            await this.replaceJsBundle(jsBundlePath, possibleBundlePaths, fallbackBundlePath);
            if (!(await this.fileExists(path.join(tempAppPath, "Info.plist")))) {
                logger.warn("Info.plist not found - app bundle may be invalid");
            }
            const executables = await this.findFiles(tempAppPath, /^[^.]*$/);
            const mainExecutable = executables.find(exe => !exe.includes(".") && !exe.includes("/"));
            if (!mainExecutable) {
                logger.warn("Main executable not found - app may not launch");
            }
            // iOS apps have _CodeSignature directory that must be removed before re-signing
            const codeSignaturePath = path.join(tempAppPath, "_CodeSignature");
            if (await this.fileExists(codeSignaturePath)) {
                await this.cleanup(codeSignaturePath);
                logger.debug("Removed old _CodeSignature");
            }
            await this.removeCodeSignatures(tempAppPath);
            if (signing?.disabled) {
                logger.info("    Signing skipped (disabled in config)");
            }
            else {
                try {
                    await this.signIOSApp(tempAppPath, projectRoot, signing);
                }
                catch (error) {
                    logger.warn(`Failed to re-sign iOS app, continuing without signing: ${error}`);
                    logger.warn("Unsigned app may not work on devices, but will work in simulator");
                }
            }
            await mkdir(path.dirname(outputPath), { recursive: true });
            await this.copyDirectory(tempAppPath, outputPath);
            await this.cleanup(tempDir);
            logger.info(`Repacked iOS app: ${outputPath}`);
            return outputPath;
        }
        catch (error) {
            await this.cleanup(tempDir).catch(() => { });
            throw new Error(`Failed to repack iOS app: ${error}`);
        }
    }
    static async replaceJsBundle(jsBundlePath, possibleBundlePaths, fallbackPath) {
        for (const bundleDest of possibleBundlePaths) {
            if (await this.fileExists(bundleDest)) {
                const originalStats = await stat(bundleDest);
                await this.copyFile(jsBundlePath, bundleDest);
                const newStats = await stat(bundleDest);
                logger.debug(`Replaced JS bundle: ${bundleDest} (${originalStats.size} -> ${newStats.size} bytes)`);
                return;
            }
        }
        await this.copyFile(jsBundlePath, fallbackPath);
        logger.debug(`Created JS bundle in standard location: ${fallbackPath}`);
    }
    static async extractZip(zipPath, destDir) {
        try {
            execSync(`unzip -q "${zipPath}" -d "${destDir}"`, { stdio: "ignore" });
        }
        catch {
            throw new Error("unzip command not available. Please install unzip.");
        }
    }
    /**
     * Creates a ZIP file from all files in a directory.
     *
     * APK is a ZIP file with specific requirements:
     * - Must not compress certain files (like .so native libraries)
     * - Must preserve file permissions
     * - Must use store (no compression) for .so, .dex files
     */
    static async createZipFromDir(sourceDir, zipPath) {
        try {
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
     * APK must be 4-byte aligned for memory mapping; zipalign must run before signing.
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
            execSync(`"${zipalignPath}" -f -p 4 "${inputApk}" "${outputApk}"`, {
                stdio: "ignore",
                timeout: 30000,
            });
            try {
                execSync(`"${zipalignPath}" -c -v 4 "${outputApk}"`, {
                    stdio: "pipe",
                    timeout: 10000,
                });
                logger.debug("APK alignment verified");
            }
            catch {
                logger.warn("APK alignment check failed, but continuing");
            }
        }
        catch (error) {
            logger.warn(`zipalign failed: ${error}`);
            logger.warn("Using unaligned APK (may cause issues)");
            await this.copyFile(inputApk, outputApk);
        }
    }
    static findAndroidSdkTool(toolName) {
        const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
        if (!androidHome)
            return null;
        try {
            const result = execSync(`find "${androidHome}/build-tools" -name "${toolName}" 2>/dev/null | head -1`, { encoding: "utf-8" });
            return result.trim() || null;
        }
        catch {
            return null;
        }
    }
    static findZipalign() {
        return this.findAndroidSdkTool("zipalign");
    }
    static findApksigner() {
        return this.findAndroidSdkTool("apksigner");
    }
    /**
     * Signs an Android APK with debug keystore.
     * Supports APK signing v1, v2, and v3.
     */
    static async signApk(apkPath, outputPath, projectRoot, signing) {
        if (signing?.disabled) {
            logger.info("    Signing skipped (disabled in config)");
            await this.copyFile(apkPath, outputPath);
            return;
        }
        const keystorePassword = signing?.keystorePassword ?? "android";
        const keyAlias = signing?.keyAlias ?? "androiddebugkey";
        const keyPassword = signing?.keyPassword ?? "android";
        let keystorePath = signing?.keystorePath ?? null;
        if (!keystorePath) {
            const possibleKeystores = [
                path.join(projectRoot, "android", "app", "debug.keystore"),
                path.join(process.env.HOME || "", ".android", "debug.keystore"),
                path.join(process.env.ANDROID_HOME || "", "debug.keystore"),
            ];
            for (const keystore of possibleKeystores) {
                if (await this.fileExists(keystore)) {
                    keystorePath = keystore;
                    break;
                }
            }
            if (!keystorePath) {
                logger.warn("Debug keystore not found, generating one...");
                keystorePath = possibleKeystores[1];
                await this.generateDebugKeystore(keystorePath);
            }
        }
        logger.debug(`Signing with keystore: ${keystorePath} (alias: ${keyAlias})`);
        try {
            const apksignerPath = this.findApksigner();
            if (apksignerPath) {
                try {
                    execSync(`"${apksignerPath}" sign --ks "${keystorePath}" --ks-pass pass:${keystorePassword} --key-pass pass:${keyPassword} --min-sdk-version 21 --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true "${apkPath}"`, {
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
            execSync(`jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore "${keystorePath}" -storepass ${keystorePassword} -keypass ${keyPassword} "${apkPath}" ${keyAlias}`, {
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
     * Signing order: main executable → Frameworks → PlugIns → WatchKit extensions → .app bundle
     * Ad-hoc signing works for simulator and development; device deployment requires proper certificates.
     */
    static async signIOSApp(appPath, projectRoot, _signing) {
        try {
            const frameworksPath = path.join(appPath, "Frameworks");
            if (await this.fileExists(frameworksPath)) {
                const frameworks = await readdir(frameworksPath);
                for (const framework of frameworks) {
                    if (framework.endsWith(".framework")) {
                        const frameworkPath = path.join(frameworksPath, framework);
                        // Sign nested frameworks first
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
            const pluginsPath = path.join(appPath, "PlugIns");
            if (await this.fileExists(pluginsPath)) {
                const plugins = await readdir(pluginsPath);
                for (const plugin of plugins) {
                    if (plugin.endsWith(".appex")) {
                        const pluginPath = path.join(pluginsPath, plugin);
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
            execSync(`codesign --force --deep --sign - "${appPath}"`, {
                stdio: "ignore",
                timeout: 30000,
            });
            logger.debug("iOS app signed with ad-hoc signature");
        }
        catch (error) {
            logger.warn(`iOS app signing failed: ${error}`);
            logger.warn("App may work in simulator but not on physical devices without proper certificates");
        }
    }
    static async generateDebugKeystore(keystorePath) {
        await mkdir(path.dirname(keystorePath), { recursive: true });
        execSync(`keytool -genkey -v -keystore "${keystorePath}" -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US"`, { stdio: "ignore" });
    }
    static async copyFile(src, dest) {
        await mkdir(path.dirname(dest), { recursive: true });
        const data = await readFile(src);
        await writeFile(dest, data);
    }
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
    static async fileExists(filePath) {
        try {
            await stat(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
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
    static async removeCodeSignatures(appPath) {
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