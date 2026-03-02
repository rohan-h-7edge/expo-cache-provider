import type { ResolveBuildCacheProps } from "@expo/config";
import { logger } from "../utils/logger.js";
import { calculateJSHash } from "./fingerprintUtils.js";

/**
 * Generates a cache key from Expo build cache props.
 * Optionally includes JS hash to detect JavaScript-only changes.
 */
export async function getCacheKey(
	{
		fingerprintHash,
		platform,
		projectRoot,
		runOptions,
	}: ResolveBuildCacheProps,
	includeJSHash: boolean = false,
): Promise<string> {
	const isDevClient =
		("variant" in runOptions && runOptions.variant === "debug") ||
		("configuration" in runOptions && runOptions.configuration === "Debug");

	let tag = `fingerprint.${fingerprintHash}`;

	if (includeJSHash) {
		try {
			const jsHash = await calculateJSHash(projectRoot);
			tag += `.js${jsHash}`;
		} catch (error) {
			logger.debug("Failed to calculate JS hash, using native fingerprint only", error);
		}
	}

	tag += isDevClient ? ".dev-client" : "";
	const extension = platform === "ios" ? "app" : "apk";
	return `${tag}.${extension}`;
}
