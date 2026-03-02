import { createHash } from "node:crypto";
/**
 * Creates a SHA-256 hash of the input string.
 */
export function hashString(input) {
    return createHash("sha256").update(input).digest("hex");
}
/**
 * Creates a SHA-256 hash of multiple inputs.
 */
export function hashMultiple(...inputs) {
    const hash = createHash("sha256");
    for (const input of inputs) {
        hash.update(input);
    }
    return hash.digest("hex");
}
//# sourceMappingURL=hash.js.map