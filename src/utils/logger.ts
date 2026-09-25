import { env } from "../config/env.js";

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, module: string, message: string, meta?: unknown): void {
  const isDev = env.NODE_ENV === "development";
  const colors: Record<LogLevel, string> = {
    INFO: "\x1b[36m",   // Cyan
    WARN: "\x1b[33m",   // Yellow
    ERROR: "\x1b[31m",  // Red
    DEBUG: "\x1b[35m",  // Magenta
  };
  const reset = "\x1b[0m";
  const color = isDev ? colors[level] : "";
  const colorReset = isDev ? reset : "";

  const logLine = `${color}[${formatTimestamp()}] [${level}] [${module}]${colorReset} ${message}`;
  
  if (level === "ERROR") {
    console.error(logLine);
  } else {
    console.log(logLine);
  }

  if (meta !== undefined) {
    console.log(isDev ? `${colors.DEBUG}  ↪ meta:${reset}` : "  ↪ meta:", JSON.stringify(meta, null, 2));
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => log("INFO", "APP", message, meta),
  warn: (message: string, meta?: unknown) => log("WARN", "APP", message, meta),
  error: (message: string, meta?: unknown) => log("ERROR", "APP", message, meta),
  debug: (message: string, meta?: unknown) => log("DEBUG", "APP", message, meta),
  
  /** For domain-specific logging with a named module prefix */
  module: (module: string) => ({
    info: (message: string, meta?: unknown) => log("INFO", module.toUpperCase(), message, meta),
    warn: (message: string, meta?: unknown) => log("WARN", module.toUpperCase(), message, meta),
    error: (message: string, meta?: unknown) => log("ERROR", module.toUpperCase(), message, meta),
    debug: (message: string, meta?: unknown) => log("DEBUG", module.toUpperCase(), message, meta),
  }),
};
