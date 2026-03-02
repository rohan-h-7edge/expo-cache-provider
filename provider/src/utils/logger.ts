/**
 * Simple logger for cache operations.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
	private enabled: boolean = true;
	private level: LogLevel = "info";

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	private shouldLog(level: LogLevel): boolean {
		if (!this.enabled) return false;
		const levels: LogLevel[] = ["debug", "info", "warn", "error"];
		return levels.indexOf(level) >= levels.indexOf(this.level);
	}

	debug(...args: unknown[]): void {
		if (this.shouldLog("debug")) {
			console.debug("[NativeCache] [DEBUG]", ...args);
		}
	}

	info(...args: unknown[]): void {
		if (this.shouldLog("info")) {
			console.info("[NativeCache] [INFO]", ...args);
		}
	}

	warn(...args: unknown[]): void {
		if (this.shouldLog("warn")) {
			console.warn("[NativeCache] [WARN]", ...args);
		}
	}

	error(...args: unknown[]): void {
		if (this.shouldLog("error")) {
			console.error("[NativeCache] [ERROR]", ...args);
		}
	}
}

export const logger = new Logger();





