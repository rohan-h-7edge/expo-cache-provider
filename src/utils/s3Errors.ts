/**
 * Utilities for summarizing S3-related errors for logging.
 */
export function summarizeS3Error(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("credentials")
		? "S3 not configured or missing credentials"
		: message;
}

