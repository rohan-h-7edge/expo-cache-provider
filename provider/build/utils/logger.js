/**
 * Simple logger for cache operations.
 */
class Logger {
    enabled = true;
    level = "info";
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    setLevel(level) {
        this.level = level;
    }
    shouldLog(level) {
        if (!this.enabled)
            return false;
        const levels = ["debug", "info", "warn", "error"];
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }
    debug(...args) {
        if (this.shouldLog("debug")) {
            console.debug("[NativeCache] [DEBUG]", ...args);
        }
    }
    info(...args) {
        if (this.shouldLog("info")) {
            console.info("[NativeCache] [INFO]", ...args);
        }
    }
    warn(...args) {
        if (this.shouldLog("warn")) {
            console.warn("[NativeCache] [WARN]", ...args);
        }
    }
    error(...args) {
        if (this.shouldLog("error")) {
            console.error("[NativeCache] [ERROR]", ...args);
        }
    }
}
export const logger = new Logger();
//# sourceMappingURL=logger.js.map