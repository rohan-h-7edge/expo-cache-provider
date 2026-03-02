/**
 * Returns true if the error is a Node.js "file not found" (ENOENT) error.
 */
export function isFileNotFoundError(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}
