import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Calculates a hash of JavaScript/TypeScript source files.
 * This can be used to detect JS-only changes that don't affect the native fingerprint.
 */
export async function calculateJSHash(projectRoot: string): Promise<string> {
	const hash = createHash("sha256");
	const jsFiles: string[] = [];

	async function walkDir(dir: string, relativePath: string = ""): Promise<void> {
		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			const relPath = path.join(relativePath, entry.name);

			// Skip node_modules, .expo, android, ios, etc.
			if (
				entry.name.startsWith(".") ||
				entry.name === "node_modules" ||
				entry.name === "android" ||
				entry.name === "ios" ||
				entry.name === "dist" ||
				entry.name === "build"
			) {
				continue;
			}

			if (entry.isDirectory()) {
				await walkDir(fullPath, relPath);
			} else if (
				entry.isFile() &&
				/\.(ts|tsx|js|jsx|json)$/.test(entry.name)
			) {
				jsFiles.push(relPath);
			}
		}
	}

	await walkDir(projectRoot);

	// Sort for consistent hashing
	jsFiles.sort();

	// Hash each file's content
	for (const file of jsFiles) {
		try {
			const filePath = path.join(projectRoot, file);
			const content = await readFile(filePath);
			hash.update(file);
			hash.update(content);
		} catch (error) {
			// Skip files that can't be read
			continue;
		}
	}

	return hash.digest("hex").slice(0, 16); // Use first 16 chars for shorter key
}





