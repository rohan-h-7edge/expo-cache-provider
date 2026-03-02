#!/usr/bin/env node
/**
 * Quick repack test: creates a minimal fake APK, runs Repack.repackAndroid(),
 * and optionally runs the same for iOS (minimal .app). No full Expo build required.
 *
 * Prerequisites: unzip, zip; for signing: Android SDK (zipalign, apksigner/jarsigner)
 * or ~/.android/debug.keystore. For iOS: macOS with codesign.
 *
 * Usage:
 *   cd expo-cache-provider/provider && npm run build && node scripts/test-repack.js [projectRoot]
 *   # Or from repo root:
 *   cd expo-cache-provider/provider && npm run build && node scripts/test-repack.js ../expo-cache-test
 *
 * projectRoot: path to Expo app (for android/app/debug.keystore or default ~/.android). Default: current dir.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execSync } = require("node:child_process");

const PROVIDER_DIR = path.resolve(__dirname, "..");
const projectRoot = path.resolve(process.argv[2] || process.cwd());

async function main() {
	console.log("Repack test script");
	console.log("  projectRoot:", projectRoot);
	console.log("  provider dir:", PROVIDER_DIR);

	// Load built Repack (must run after npm run build)
	let Repack;
	try {
		const buildRepack = path.join(PROVIDER_DIR, "build", "repack", "Repack.js");
		Repack = require(buildRepack).Repack;
	} catch (e) {
		console.error("Failed to load Repack. Run from provider dir: npm run build");
		console.error(e.message);
		process.exit(1);
	}

	const tempDir = path.join(os.tmpdir(), `repack-test-${Date.now()}`);
	await fs.mkdir(tempDir, { recursive: true });

	try {
		// 1) Minimal AndroidManifest.xml (Repack only checks existence)
		const manifestPath = path.join(tempDir, "AndroidManifest.xml");
		await fs.writeFile(
			manifestPath,
			'<?xml version="1.0" encoding="utf-8"?><manifest xmlns:android="http://schemas.android.com/apk/res/android" package="test.repack.app"/>',
			"utf8"
		);

		// 2) Minimal classes.dex (DEX magic + minimal size so tools don't complain)
		const dexPath = path.join(tempDir, "classes.dex");
		const dexMagic = Buffer.from([
			0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00, // dex\n035\0
		]);
		// Pad to at least 32 bytes
		await fs.writeFile(dexPath, Buffer.concat([dexMagic, Buffer.alloc(24, 0)]));

		// 3) Minimal JS bundle in standard location (so Repack finds and replaces it)
		const assetsDir = path.join(tempDir, "assets");
		await fs.mkdir(assetsDir, { recursive: true });
		const bundlePath = path.join(assetsDir, "index.android.bundle");
		await fs.writeFile(bundlePath, "// minimal JS bundle (original)\n", "utf8");

		// 4) Create minimal APK (ZIP)
		const minimalApk = path.join(tempDir, "minimal.apk");
		execSync(`cd "${tempDir}" && zip -0 -q -r "${minimalApk}" .`, {
			stdio: "ignore",
			timeout: 10000,
		});

		// 5) New JS bundle content (what we want to inject)
		const newBundlePath = path.join(tempDir, "new-bundle.android.bundle");
		await fs.writeFile(
			newBundlePath,
			"// NEW bundle injected by repack test – " + new Date().toISOString() + "\n",
			"utf8"
		);

		// 6) Output path for repacked APK
		const outputPath = path.join(tempDir, "repacked.apk");

		console.log("\nRunning Repack.repackAndroid(...)");
		await Repack.repackAndroid(minimalApk, newBundlePath, outputPath, projectRoot);

		const outStat = await fs.stat(outputPath).catch(() => null);
		if (outStat) {
			console.log("\nSuccess. Repacked APK:", outputPath);
			console.log("Size:", outStat.size, "bytes");
		}
	} catch (err) {
		console.error("\nRepack failed:", err.message);
		process.exit(1);
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
	}
}

main();
