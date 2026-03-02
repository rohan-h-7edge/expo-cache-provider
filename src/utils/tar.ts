import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { create, extract } from "tar";
import path from "node:path";
import { tmpdir } from "node:os";

function makeTempFilePath(prefix: string): string {
	return path.join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`);
}

async function withTempFile<T>(prefix: string, fn: (tempPath: string) => Promise<T>): Promise<T> {
	const tempPath = makeTempFilePath(prefix);
	try {
		return await fn(tempPath);
	} finally {
		await unlink(tempPath).catch(() => {});
	}
}

/**
 * Creates a tarball (gzipped tar) from a directory.
 */
export async function createTarball(sourceDir: string): Promise<Buffer> {
	return withTempFile("cache", async (tempFile) => {
		await create(
			{ cwd: path.dirname(sourceDir), file: tempFile, gzip: true },
			[path.basename(sourceDir)],
		);
		return readFile(tempFile);
	});
}

/**
 * Extracts a tarball (gzipped tar) to a target directory.
 */
export async function extractTarball(tarballData: Buffer, targetDir: string): Promise<void> {
	await withTempFile("cache-extract", async (tempFile) => {
		await mkdir(path.dirname(targetDir), { recursive: true });
		await writeFile(tempFile, tarballData);
		await extract({ cwd: path.dirname(targetDir), file: tempFile, gzip: true });
	});
}

