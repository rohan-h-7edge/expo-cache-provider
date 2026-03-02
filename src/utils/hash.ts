import { createHash } from "node:crypto";

/**
 * Hashes a key to a safe filename.
 * Uses SHA-256 to ensure consistent, safe filenames.
 */
export function hashKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}






