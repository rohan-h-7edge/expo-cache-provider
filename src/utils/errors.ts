/**
 * Custom error types for cache operations
 */

export class CacheError extends Error {
	constructor(message: string, public readonly cause?: unknown) {
		super(message);
		this.name = "CacheError";
	}
}

export class DiskCacheError extends CacheError {
	constructor(message: string, cause?: unknown) {
		super(message, cause);
		this.name = "DiskCacheError";
	}
}

export class S3CacheError extends CacheError {
	constructor(message: string, cause?: unknown) {
		super(message, cause);
		this.name = "S3CacheError";
	}
}






