/**
 * Simple logger for cache operations.
 */
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
class Logger {
    prefix;
    enabled = true;
    level = "info";
    constructor(prefix = "Cache") {
        this.prefix = prefix;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    setLevel(level) {
        this.level = level;
    }
    shouldLog(level) {
        return this.enabled && LOG_LEVELS[level] >= LOG_LEVELS[this.level];
    }
    debug(...args) {
        if (this.shouldLog("debug"))
            console.debug(`[${this.prefix}] [DEBUG]`, ...args);
    }
    info(...args) {
        if (this.shouldLog("info"))
            console.info(`[${this.prefix}] [INFO]`, ...args);
    }
    warn(...args) {
        if (this.shouldLog("warn"))
            console.warn(`[${this.prefix}] [WARN]`, ...args);
    }
    error(...args) {
        if (this.shouldLog("error"))
            console.error(`[${this.prefix}] [ERROR]`, ...args);
    }
}
export const logger = new Logger("NativeCache");
//# sourceMappingURL=logger.js.map