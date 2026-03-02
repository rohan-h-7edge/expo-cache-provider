import { readFile, writeFile, unlink, access, mkdir, readdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { logger } from "../utils/logger.js";

function isFileNotFoundError(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

/**
 * Local disk-based cache for native build artifacts.
 */
export class DiskCache {
	constructor(private readonly cacheDir: string) {
		if (!cacheDir) {
			throw new Error("cacheDir is required");
		}
	}

	async get(key: string): Promise<Buffer | null> {
		try {
			const data = await readFile(this.keyToPath(key));
			logger.debug(`Disk cache HIT: ${key}`);
			return data;
		} catch (error) {
			if (isFileNotFoundError(error)) {
				logger.debug(`Disk cache MISS: ${key}`);
				return null;
			}
			logger.error(`Failed to read cache key: ${key}`, error);
			throw error;
		}
	}

	async set(key: string, value: Buffer): Promise<void> {
		try {
			const filePath = this.keyToPath(key);
			await mkdir(path.dirname(filePath), { recursive: true });
			await writeFile(filePath, value);
			logger.debug(`Disk cache SET: ${key}`);
		} catch (error) {
			logger.error(`Failed to write cache key: ${key}`, error);
			throw error;
		}
	}

	async exists(key: string): Promise<boolean> {
		try {
			await access(this.keyToPath(key), constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	async clear(): Promise<void> {
		try {
			const entries = await readdir(this.cacheDir, { withFileTypes: true });
			for (const entry of entries) {
				const entryPath = path.join(this.cacheDir, entry.name);
				if (entry.isDirectory()) {
					await rm(entryPath, { recursive: true, force: true });
				} else {
					await unlink(entryPath);
				}
			}
			logger.info(`Cleared disk cache: ${this.cacheDir}`);
		} catch (error) {
			if (isFileNotFoundError(error)) {
				logger.debug(`Cache directory does not exist: ${this.cacheDir}`);
				return;
			}
			logger.error(`Failed to clear cache: ${this.cacheDir}`, error);
			throw error;
		}
	}

	private keyToPath(key: string): string {
		return path.join(this.cacheDir, key.replace(/\//g, path.sep));
	}
}





