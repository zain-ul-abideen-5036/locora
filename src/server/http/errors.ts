/**
 * The error type every layer below the route handler throws.
 *
 * Service and repository code has no business knowing about `Response`, but it
 * does know the difference between "you may not do that" and "that does not
 * exist" — and that difference is exactly an HTTP status. `AppError` carries
 * the status without carrying the transport, so one wrapper
 * (`src/server/http/handler.ts`) can turn any thrown error into a correctly
 * shaped response and nothing else has to.
 *
 * `message` is written for the person who will read it on screen. That is a
 * deliberate constraint: it means no handler is tempted to pass a database
 * error's text through to a client, which is how table names, column names and
 * query fragments end up in a browser.
 */
export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "payload_too_large"
  | "rate_limited"
  | "internal_error";

const STATUS_FOR_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  payload_too_large: 413,
  rate_limited: 429,
  internal_error: 500,
};

/** A per-field message, so a form can put the error next to the input that caused it. */
export interface FieldError {
  field: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: FieldError[] | undefined;
  /** Extra response headers this error requires, e.g. `Retry-After` on a 429. */
  readonly headers: Record<string, string> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: { fields?: FieldError[]; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_FOR_CODE[code];
    this.fields = options.fields;
    this.headers = options.headers;
  }
}

export const badRequest = (message: string, fields?: FieldError[]): AppError =>
  new AppError("bad_request", message, { fields });

export const unauthorized = (message = "You need to sign in to do that."): AppError =>
  new AppError("unauthorized", message);

export const forbidden = (message = "You do not have access to that."): AppError =>
  new AppError("forbidden", message);

export const notFound = (message = "Not found."): AppError => new AppError("not_found", message);

export const conflict = (message: string): AppError => new AppError("conflict", message);

export const validationFailed = (fields: FieldError[], message = "Please check the highlighted fields."): AppError =>
  new AppError("validation_failed", message, { fields });

export const payloadTooLarge = (message: string): AppError =>
  new AppError("payload_too_large", message);

export const rateLimited = (retryAfterSeconds: number): AppError =>
  new AppError("rate_limited", "Too many attempts. Please wait and try again.", {
    // RFC 9110: tells a well-behaved client exactly how long to wait, rather
    // than leaving it to guess and retry in a tight loop.
    headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) },
  });

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
