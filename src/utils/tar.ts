import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { create, extract } from "tar";
import path from "node:path";
import { tmpdir } from "node:os";

/**
 * Creates a tarball (gzipped tar) from a directory.
 */
export async function createTarball(sourceDir: string): Promise<Buffer> {
	const tempFile = path.join(tmpdir(), `cache-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`);
	
	try {
		const writeStream = createWriteStream(tempFile);
		const gzipStream = createGzip();
		
		await pipeline(
			create({ cwd: path.dirname(sourceDir), gzip: false }, [path.basename(sourceDir)]),
			gzipStream,
			writeStream,
		);

		const data = await readFile(tempFile);
		await unlink(tempFile);
		
		return data;
	} catch (error) {
		// Cleanup on error
		try {
			await unlink(tempFile);
		} catch {
			// Ignore cleanup errors
		}
		throw error;
	}
}

/**
 * Extracts a tarball (gzipped tar) to a target directory.
 */
export async function extractTarball(tarballData: Buffer, targetDir: string): Promise<void> {
	const tempFile = path.join(tmpdir(), `cache-extract-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`);
	
	try {
		await mkdir(path.dirname(targetDir), { recursive: true });
		await writeFile(tempFile, tarballData);

		const readStream = createReadStream(tempFile);
		const gunzipStream = createGunzip();
		
		await pipeline(
			readStream,
			gunzipStream,
			extract({ cwd: path.dirname(targetDir), strip: 1 }),
		);

		await unlink(tempFile);
	} catch (error) {
		// Cleanup on error
		try {
			await unlink(tempFile);
		} catch {
			// Ignore cleanup errors
		}
		throw error;
	}
}

