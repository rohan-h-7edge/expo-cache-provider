import { mkdir } from "node:fs/promises";
import path from "node:path";
import { hashKey } from "../utils/hash.js";

const HASH_PREFIX_LENGTH = 2;

/**
 * Converts a cache key to a safe file path within the cache directory.
 * Uses a two-character prefix subdirectory to limit directory entry counts.
 */
export function keyToPath(cacheDir: string, key: string): string {
	const hashedKey = hashKey(key);
	const subDir = hashedKey.slice(0, HASH_PREFIX_LENGTH);
	return path.join(cacheDir, subDir, hashedKey);
}

/**
 * Ensures the directory for a given path exists.
 */
export async function ensureDir(filePath: string): Promise<void> {
	await mkdir(path.dirname(filePath), { recursive: true });
}






