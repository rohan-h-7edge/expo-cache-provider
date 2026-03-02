import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const JS_HASH_LENGTH = 16;

const EXCLUDED_DIRECTORIES = new Set([
	"node_modules",
	"android",
	"ios",
	"dist",
	"build",
]);

const JS_FILE_PATTERN = /\.(ts|tsx|js|jsx|json)$/;

function isExcludedDirectory(name: string): boolean {
	return name.startsWith(".") || EXCLUDED_DIRECTORIES.has(name);
}

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
			if (entry.isDirectory()) {
				if (isExcludedDirectory(entry.name)) continue;
				await walkDir(path.join(dir, entry.name), path.join(relativePath, entry.name));
			} else if (entry.isFile() && JS_FILE_PATTERN.test(entry.name)) {
				jsFiles.push(path.join(relativePath, entry.name));
			}
		}
	}

	await walkDir(projectRoot);
	jsFiles.sort();

	for (const file of jsFiles) {
		try {
			const content = await readFile(path.join(projectRoot, file));
			hash.update(file);
			hash.update(content);
		} catch {
			// Skip files that can't be read
		}
	}

	return hash.digest("hex").slice(0, JS_HASH_LENGTH);
}





