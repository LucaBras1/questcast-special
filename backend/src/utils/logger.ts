/**
 * Structured logger for Questcast backend.
 * Wraps console with structured JSON output in production.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
}

function formatEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(data !== undefined && { data }),
  };
}

const isProduction = process.env.NODE_ENV === 'production';

function log(level: LogLevel, message: string, data?: unknown) {
  const entry = formatEntry(level, message, data);

  if (isProduction) {
    const output = JSON.stringify(entry);
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.info(output);
    }
  } else {
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    if (level === 'error') {
      console.error(prefix, message, data ?? '');
    } else if (level === 'warn') {
      console.warn(prefix, message, data ?? '');
    } else {
      console.info(prefix, message, data ?? '');
    }
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => log('debug', message, data),
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
};
