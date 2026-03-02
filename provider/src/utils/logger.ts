/**
 * Simple logger for cache operations.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
	private enabled: boolean = true;
	private level: LogLevel = "info";

	constructor(private readonly prefix: string = "Cache") {}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	private shouldLog(level: LogLevel): boolean {
		return this.enabled && LOG_LEVELS[level] >= LOG_LEVELS[this.level];
	}

	debug(...args: unknown[]): void {
		if (this.shouldLog("debug")) console.debug(`[${this.prefix}] [DEBUG]`, ...args);
	}

	info(...args: unknown[]): void {
		if (this.shouldLog("info")) console.info(`[${this.prefix}] [INFO]`, ...args);
	}

	warn(...args: unknown[]): void {
		if (this.shouldLog("warn")) console.warn(`[${this.prefix}] [WARN]`, ...args);
	}

	error(...args: unknown[]): void {
		if (this.shouldLog("error")) console.error(`[${this.prefix}] [ERROR]`, ...args);
	}
}

export const logger = new Logger("NativeCache");





