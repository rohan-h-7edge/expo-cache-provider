/**
 * Simple logger for cache operations.
 */
type LogLevel = "debug" | "info" | "warn" | "error";
declare class Logger {
    private enabled;
    private level;
    setEnabled(enabled: boolean): void;
    setLevel(level: LogLevel): void;
    private shouldLog;
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map