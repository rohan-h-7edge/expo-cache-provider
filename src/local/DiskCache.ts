import { readFile, writeFile, unlink, access, readdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { CacheProvider } from "../types/CacheTypes.js";
import { DiskCacheError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { keyToPath, ensureDir } from "./pathUtils.js";
import { isFileNotFoundError } from "../utils/nodeErrors.js";

/**
 * Local disk-based cache implementation.
 */
export class DiskCache implements CacheProvider {
	constructor(private readonly cacheDir: string) {
		if (!cacheDir) {
			throw new DiskCacheError("cacheDir is required");
		}
	}

	async get(key: string): Promise<Buffer | null> {
		try {
			const filePath = keyToPath(this.cacheDir, key);
			const data = await readFile(filePath);
			logger.debug(`Disk cache HIT: ${key}`);
			return data;
		} catch (error) {
			if (isFileNotFoundError(error)) {
				logger.debug(`Disk cache MISS: ${key}`);
				return null;
			}
			throw new DiskCacheError(`Failed to read cache key: ${key}`, error);
		}
	}

	async set(key: string, value: Buffer): Promise<void> {
		try {
			const filePath = keyToPath(this.cacheDir, key);
			await ensureDir(filePath);
			await writeFile(filePath, value);
			logger.debug(`Disk cache SET: ${key}`);
		} catch (error) {
			throw new DiskCacheError(`Failed to write cache key: ${key}`, error);
		}
	}

	async exists(key: string): Promise<boolean> {
		try {
			const filePath = keyToPath(this.cacheDir, key);
			await access(filePath, constants.F_OK);
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
			throw new DiskCacheError(`Failed to clear cache: ${this.cacheDir}`, error);
		}
	}
}






