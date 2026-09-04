/**
 * The browser's client for Locora's own API.
 *
 * Same-origin, so authentication is entirely the browser attaching its own
 * httpOnly cookies — there is no token to read, store or forget to send, and no
 * `Authorization` header anywhere in the client code.
 *
 * ## Silent refresh
 *
 * Access tokens last fifteen minutes and refresh tokens last seven days.
 * Without the retry below, that seven-day session is worth nothing in practice:
 * fifteen minutes into a sitting the access token expires and the user appears
 * to have been signed out at random, mid-form, on a page they were reading.
 *
 * So a 401 triggers one refresh and one retry. Once only, and never for the
 * auth endpoints themselves — a failed sign-in legitimately returns 401 and
 * retrying it would be nonsense.
 *
 * ## Why concurrent refreshes are de-duplicated
 *
 * This is the part that is easy to leave out and expensive to omit. A dashboard
 * that fires four requests at once would start four refreshes. Refresh tokens
 * rotate on use and a replayed one is treated as theft, so the second, third
 * and fourth would each present a token the first had just revoked — and the
 * server would correctly respond by revoking every session the account has.
 *
 * In other words: without `refreshInFlight`, loading a page with a few parallel
 * requests signs the user out of everything, and does it in a way that looks
 * like a security feature working rather than a bug.
 */

export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldIssue[] | undefined;
  /** Correlates with the server log; shown on a 500 so a report is actionable. */
  readonly requestId: string | undefined;

  constructor(
    status: number,
    message: string,
    options: { code?: string; fields?: FieldIssue[]; requestId?: string } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options.code ?? "unknown";
    this.fields = options.fields;
    this.requestId = options.requestId;
  }

  /** Per-field messages keyed by field name, for wiring straight into a form. */
  fieldErrors(): Record<string, string> {
    const output: Record<string, string> = {};
    for (const issue of this.fields ?? []) {
      // First message per field wins: showing three rules under one input at
      // once is noise, and the first is the one to fix.
      output[issue.field] ??= issue.message;
    }
    return output;
  }
}

/** Endpoints that must never trigger refresh-and-retry. */
const NO_RETRY_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
];

let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch("/api/auth/refresh", { method: "POST" })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  /** Serialised as JSON unless it is FormData, which must set its own boundary. */
  body?: unknown;
  /** Internal: set on the single retry, to stop a loop. */
  isRetry?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, isRetry, headers, ...rest } = options;

  const isFormData = body instanceof FormData;
  const requestInit: RequestInit = {
    ...rest,
    headers: {
      // Never set for FormData: the browser has to add its own multipart
      // boundary, and an explicit Content-Type overwrites it, which makes the
      // server unable to parse the parts.
      ...(body !== undefined && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {}),
  };

  let response: Response;
  try {
    response = await fetch(path, requestInit);
  } catch {
    // `fetch` only rejects on a network-level failure. Surfacing that as its
    // own status stops the UI reporting "request failed" for what is actually
    // "you are offline".
    throw new ApiError(0, "Could not reach Locora. Check your connection and try again.", {
      code: "network_error",
    });
  }

  if (response.status === 401 && !isRetry && !NO_RETRY_PATHS.some((p) => path.startsWith(p))) {
    if (await refreshSession()) {
      return apiFetch<T>(path, { ...options, isRetry: true });
    }
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: Record<string, unknown> } | null)?.error;
    throw new ApiError(
      response.status,
      typeof error?.message === "string"
        ? error.message
        : "Something went wrong. Please try again.",
      {
        code: typeof error?.code === "string" ? error.code : undefined,
        fields: Array.isArray(error?.fields) ? (error.fields as FieldIssue[]) : undefined,
        requestId: typeof error?.requestId === "string" ? error.requestId : undefined,
      },
    );
  }

  return payload as T;
}

/**
 * Turns any thrown value into a sentence that can go on screen.
 *
 * Every `catch` in the UI goes through this, so no code path can accidentally
 * render a raw `Error.message` from somewhere unexpected — a stack fragment or
 * a driver error is not something to show a person looking for their relative.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}
