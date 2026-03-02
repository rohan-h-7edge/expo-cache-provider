import path from "node:path";
import { hashKey } from "../utils/hash.js";

/**
 * Converts a cache key to a safe file path within the cache directory.
 */
export function keyToPath(cacheDir: string, key: string): string {
	const hashedKey = hashKey(key);
	// Use first 2 chars as subdirectory to avoid too many files in one directory
	const subDir = hashedKey.slice(0, 2);
	return path.join(cacheDir, subDir, hashedKey);
}

/**
 * Ensures the directory for a given path exists.
 */
export async function ensureDir(filePath: string): Promise<void> {
	const { mkdir } = await import("node:fs/promises");
	await mkdir(path.dirname(filePath), { recursive: true });
}






