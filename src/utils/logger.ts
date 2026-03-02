/**
 * Simple logger utility
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
			console.debug("[Cache] [DEBUG]", ...args);
		}
	}

	info(...args: unknown[]): void {
		if (this.shouldLog("info")) {
			console.info("[Cache] [INFO]", ...args);
		}
	}

	warn(...args: unknown[]): void {
		if (this.shouldLog("warn")) {
			console.warn("[Cache] [WARN]", ...args);
		}
	}

	error(...args: unknown[]): void {
		if (this.shouldLog("error")) {
			console.error("[Cache] [ERROR]", ...args);
		}
	}
}

export const logger = new Logger();






