import { forbidden, notFound, redirect, unauthorized } from "next/navigation";

import { isAppError } from "./errors";

/**
 * Translates a service-layer error into the right *page* outcome.
 *
 * ## Why this is needed at all
 *
 * `AppError` carries an HTTP status, and a route handler turns that into a
 * response. A Server Component cannot: throwing anything from a page hits the
 * error boundary, which renders "something went wrong" with a 500 — so a case a
 * visitor is not permitted to see, or one that does not exist, would report a
 * server fault. That is wrong for the visitor, wrong for a crawler, and wrong
 * for anybody trying to diagnose it.
 *
 * Next's navigation primitives are the page equivalent of a status code, and
 * this maps onto them:
 *
 * - **404** → `notFound()`, rendering not-found.tsx with a real 404.
 * - **403** → `forbidden()`, rendering forbidden.tsx with a real 403. Chosen
 *   over a redirect because hiding the review console's existence buys nothing —
 *   it is linked from the navigation for reviewers and its paths are not secret —
 *   while a clear 403 is what lets an operator work out why a colleague cannot
 *   see it.
 * - **401** → a redirect to sign in, carrying where they were going. Better
 *   than `unauthorized()` here: somebody signed out needs the form, not a page
 *   telling them they are signed out.
 *
 * Anything else is rethrown, so a genuine fault still reaches the error
 * boundary and the logs rather than being quietly turned into a 404.
 *
 * ## Note on the return type
 *
 * Declared as `never`: each branch throws a control-flow signal that Next
 * catches. Callers can therefore write `catch (error) { toPageError(error) }`
 * without TypeScript believing execution continues afterwards.
 */
export function toPageError(error: unknown, options: { returnTo?: string } = {}): never {
  if (!isAppError(error)) throw error;

  if (error.status === 404) notFound();
  if (error.status === 403) forbidden();

  if (error.status === 401) {
    const next = options.returnTo;
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }

  // A 400, a 409, a 500 from below — none of which a page should swallow. Let
  // the error boundary deal with it.
  throw error;
}

/** Re-exported so a page can signal these directly without importing two modules. */
export { forbidden, notFound, redirect, unauthorized };
