/**
 * Structured logging, with redaction built in rather than remembered.
 *
 * Logs on this platform are a privacy surface. A log line naming a missing
 * child, their address and their family's phone number is a copy of the most
 * sensitive record in the system, sitting in whatever aggregator the platform
 * ships to, outside every access control the application has. So this module
 * makes the safe thing the easy thing: `redact` runs over every context object,
 * and any key that looks like a credential or personal detail is replaced
 * before it can be serialised.
 *
 * ESLint forbids bare `console.log` outside scripts and tests
 * (see eslint.config.mjs), so this is the only route to a log line in
 * application code and the redaction cannot be bypassed by accident.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

/**
 * Keys whose values never belong in a log.
 *
 * Matched as substrings, case-insensitively, so `contactPhone`, `phone_number`
 * and `reporterPhone` are all caught by one entry. Over-redacting is the
 * correct failure direction: a `[redacted]` where something harmless used to be
 * costs a few minutes of debugging, while the reverse costs somebody their
 * privacy and cannot be undone once shipped.
 */
const REDACTED_KEY_PATTERNS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "session",
  "credential",
  "apikey",
  "api_key",
  "jti",
  "hash",
  // Personal data specific to this domain.
  "email",
  "phone",
  "contact",
  "address",
  "fullname",
  "full_name",
  "whereabouts",
  "latitude",
  "longitude",
  "policereport",
  "police_report",
  "notes",
];

const REDACTED = "[redacted]";
const MAX_STRING_LENGTH = 512;
const MAX_DEPTH = 4;

function shouldRedact(key: string): boolean {
  const lowered = key.toLowerCase();
  return REDACTED_KEY_PATTERNS.some((pattern) => lowered.includes(pattern));
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    // Bounded: an accidental log of a whole result set should not become a
    // thousand-line entry.
    return value.slice(0, 20).map((entry) => redact(entry, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = shouldRedact(key) ? REDACTED : redact(entry, depth + 1);
    }
    return output;
  }
  return "[unserialisable]";
}

interface LogLine {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const line: LogLine = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? (redact(context) as LogContext) : {}),
  };

  // One JSON object per line: what every log aggregator can parse without a
  // custom grok pattern. `console.error` for warn and error so they land on
  // stderr and can be alerted on separately.
  const serialised = JSON.stringify(line);
  if (level === "error" || level === "warn") console.error(serialised);
  else console.warn(serialised);
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    // Off outside development. Debug lines are the ones written in a hurry, so
    // they are also the ones most likely to carry something they should not.
    if (process.env.NODE_ENV === "production") return;
    emit("debug", message, context);
  },
  info(message: string, context?: LogContext): void {
    emit("info", message, context);
  },
  warn(message: string, context?: LogContext): void {
    emit("warn", message, context);
  },
  error(message: string, context?: LogContext): void {
    emit("error", message, context);
  },
};
