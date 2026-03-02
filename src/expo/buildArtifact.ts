import { readFile, writeFile, cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { createTarball, extractTarball } from "../utils/tar.js";

/**
 * Reads a build artifact into a Buffer.
 * Directories (.app bundles) are compressed into a tarball; files (.apk) are read directly.
 */
export async function readBuildArtifact(buildPath: string): Promise<Buffer> {
	const buildStats = await stat(buildPath);
	if (buildStats.isDirectory()) {
		return createTarball(buildPath);
	}
	return readFile(buildPath);
}

/**
 * Writes cached artifact data to the given target path.
 * Tarballs (.app extension) are extracted; raw files (.apk) are written directly.
 */
export async function writeCachedArtifact(
	data: Buffer,
	cacheKey: string,
	targetPath: string,
): Promise<void> {
	await mkdir(path.dirname(targetPath), { recursive: true });
	if (cacheKey.endsWith(".app")) {
		await extractTarball(data, targetPath);
	} else {
		await writeFile(targetPath, data);
	}
}

/**
 * Copies a build artifact to the local fast-access cache directory.
 */
export async function copyToLocalCache(
	buildPath: string,
	cacheKey: string,
	localCacheDir: string,
): Promise<string> {
	const localPath = path.join(localCacheDir, path.basename(cacheKey));
	await mkdir(path.dirname(localPath), { recursive: true });
	await cp(buildPath, localPath, { recursive: true });
	return localPath;
}
