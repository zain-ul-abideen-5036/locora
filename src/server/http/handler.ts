/**
 * The wrapper every route handler is defined through.
 *
 * Without it, each route repeats the same try/catch, the same JSON envelope and
 * the same "is this an AppError or something unexpected" question — and the
 * routes that forget lose the guarantee that an unexpected failure does not
 * leak its message. With it, a route body throws and this decides what the
 * client sees.
 *
 * ## What an unexpected error returns
 *
 * A thrown `AppError` carries a status and a message written for a person, so
 * both are used. Anything else — a Postgres error, a TypeError, a failed
 * assertion — becomes a flat 500 with a fixed message and a correlation id.
 * The real error goes to the log. This is the one place that stops a database
 * error's text, complete with table and column names and sometimes a fragment
 * of the offending row, from being rendered in somebody's browser.
 */
import { ZodError } from "zod";

import { AppError, isAppError } from "@/server/http/errors";
import { logger } from "@/server/observability/logger";
import { toFieldErrors } from "@/lib/validation/common";

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    fields?: { field: string; message: string }[];
    /** Echoed in the response and logged alongside the real error, so a user
     *  reporting "it failed" can be matched to the exact log line. */
    requestId: string;
  };
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" } as const;

export function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

function errorResponse(error: AppError, requestId: string): Response {
  const body: ErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
      requestId,
    },
  };
  return jsonResponse(body, error.status, error.headers ?? {});
}

export type RouteContext<P = Record<string, string>> = {
  params: Promise<P>;
};

export type RouteHandler<P = Record<string, string>> = (
  request: Request,
  context: RouteContext<P>,
) => Promise<Response>;

/**
 * Wraps a handler with error translation and request correlation.
 *
 * An inbound `X-Request-ID` is honoured so a trace survives a proxy in front;
 * otherwise one is generated. It comes back on every response, which is what
 * turns "it broke this morning" into a single log lookup.
 */
export function route<P = Record<string, string>>(handler: RouteHandler<P>): RouteHandler<P> {
  return async (request, context) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const startedAt = Date.now();

    try {
      const response = await handler(request, context);
      response.headers.set("X-Request-ID", requestId);
      return response;
    } catch (error) {
      if (isAppError(error)) {
        // Expected refusals are logged at warn and without a stack: a 401 on a
        // wrong password is not an incident, and treating it as one buries the
        // failures that are.
        logger.warn("Request refused", {
          method: request.method,
          path: new URL(request.url).pathname,
          status: error.status,
          code: error.code,
          requestId,
          durationMs: Date.now() - startedAt,
        });
        const response = errorResponse(error, requestId);
        response.headers.set("X-Request-ID", requestId);
        return response;
      }

      if (error instanceof ZodError) {
        // A schema failure that escaped a route's own parse. Still a 422 with
        // per-field messages rather than a 500 — the request was malformed, not
        // the server.
        const appError = new AppError("validation_failed", "Please check the highlighted fields.", {
          fields: toFieldErrors(error),
        });
        const response = errorResponse(appError, requestId);
        response.headers.set("X-Request-ID", requestId);
        return response;
      }

      logger.error("Unhandled error in request handler", {
        method: request.method,
        path: new URL(request.url).pathname,
        requestId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.split("\n").slice(0, 6).join("\n") : undefined,
      });

      const response = errorResponse(
        new AppError(
          "internal_error",
          "Something went wrong on our side. Please try again — if it keeps happening, quote the reference below.",
        ),
        requestId,
      );
      response.headers.set("X-Request-ID", requestId);
      return response;
    }
  };
}

/**
 * Parses a JSON body, or fails with a 400 rather than a 500.
 *
 * An empty body, a truncated upload or a client that sent form-encoded data by
 * mistake all make `request.json()` throw, and an unwrapped throw here would be
 * indistinguishable from a server fault.
 */
export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new AppError("bad_request", "This endpoint expects a JSON body.");
  }
  try {
    return await request.json();
  } catch {
    throw new AppError("bad_request", "That request body is not valid JSON.");
  }
}

/**
 * Validates a body against a schema, raising a 422 with per-field messages.
 *
 * Typed loosely against the schema's parse contract rather than importing
 * Zod's generic types, so this stays usable with any of the schema shapes in
 * src/lib/validation — several of which are intersections and unions rather
 * than plain objects.
 */
export function parseWith<T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: ZodError } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("validation_failed", "Please check the highlighted fields.", {
      fields: toFieldErrors(result.error),
    });
  }
  return result.data;
}

/** Query parameters as a plain object, for feeding to a schema. */
export function searchParamsToObject(url: string): Record<string, string> {
  const params = new URL(url).searchParams;
  const output: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (value !== "") output[key] = value;
  }
  return output;
}
