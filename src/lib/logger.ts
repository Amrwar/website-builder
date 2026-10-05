/**
 * Structured logging.
 *
 * One line of JSON per event in production, so Vercel's log drain and any
 * downstream aggregator can filter on fields rather than grepping prose. In
 * development the same event is printed readably.
 *
 * Every payload passes through redaction before it is written. Logs are the
 * most common way a secret escapes a system: someone logs "the whole request"
 * while debugging, and a token ends up in a retained log store. Redacting at
 * the sink rather than at each call site means nobody has to remember.
 */

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Values that must never reach a log, matched on the key. */
const SENSITIVE_KEY =
  /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|dsn|credential|signature)/i;

/** Long strings are truncated: a log line is a summary, not a payload dump. */
const MAX_STRING_LENGTH = 512;
const MAX_DEPTH = 6;

export const REDACTED = "[redacted]";

export type LogContext = Record<string, unknown>;

/**
 * Recursively replaces sensitive values and bounds the output size.
 *
 * Handles cycles, which otherwise throw inside `JSON.stringify` and take the
 * request down with them -- a logging call must never be the thing that fails.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated ${value.length - MAX_STRING_LENGTH}]`
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause ? { cause: redact(value.cause, depth + 1, seen) } : {}),
    };
  }

  if (value instanceof Date) return value.toISOString();

  if (depth >= MAX_DEPTH) return "[max depth]";

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((entry) => redact(entry, depth + 1, seen));
    }

    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(entry, depth + 1, seen);
    }
    return output;
  }

  return String(value);
}

export interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

/** Where a formatted record is written. Swapped in tests. */
export type LogSink = (record: LogRecord, formatted: string) => void;

function defaultSink(record: LogRecord, formatted: string): void {
  // `error` and `warn` go to stderr so they survive log-level filtering in
  // environments that separate the two streams.
  if (record.level === "error") console.error(formatted);
  else if (record.level === "warn") console.warn(formatted);
  // The logger is the sanctioned console boundary; everywhere else uses it.
  // eslint-disable-next-line no-console
  else console.log(formatted);
}

function format(record: LogRecord, pretty: boolean): string {
  if (!pretty) return JSON.stringify(record);

  const context =
    record.context && Object.keys(record.context).length > 0
      ? ` ${JSON.stringify(record.context)}`
      : "";
  return `${record.level.toUpperCase().padEnd(5)} ${record.message}${context}`;
}

export interface LoggerOptions {
  /** Minimum level written. Anything below is dropped before formatting. */
  level?: LogLevel;
  /** Fields merged into every record from this logger. */
  base?: LogContext;
  pretty?: boolean;
  sink?: LogSink;
  now?: () => Date;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Returns a logger with additional bound fields, e.g. a request id. */
  child(context: LogContext): Logger;
}

function resolveDefaultLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL;
  if (configured && (LOG_LEVELS as readonly string[]).includes(configured)) {
    return configured as LogLevel;
  }
  // Tests stay quiet unless a level is set explicitly; production drops debug.
  if (process.env.NODE_ENV === "test") return "error";
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const {
    level = resolveDefaultLevel(),
    base = {},
    pretty = process.env.NODE_ENV !== "production",
    sink = defaultSink,
    now = () => new Date(),
  } = options;

  const threshold = LEVEL_RANK[level];

  function write(recordLevel: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_RANK[recordLevel] < threshold) return;

    const merged = { ...base, ...context };
    const record: LogRecord = {
      level: recordLevel,
      message,
      timestamp: now().toISOString(),
      ...(Object.keys(merged).length > 0
        ? { context: redact(merged) as LogContext }
        : {}),
    };

    sink(record, format(record, pretty));
  }

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context),
    child: (context) => createLogger({ ...options, base: { ...base, ...context } }),
  };
}

/** Application-wide logger. Prefer `logger.child({ … })` at a call site. */
export const logger = createLogger();
