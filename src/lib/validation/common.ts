/**
 * Validation primitives shared by every schema.
 *
 * These schemas run in two places: in the browser, so a form can show a problem
 * before a round trip, and in the route handler, which is where validation
 * actually counts. The browser copy is a convenience. The server copy is the
 * boundary — a request that arrives by curl gets exactly the same treatment.
 */
import { z } from "zod";

export const uuidSchema = z.string().uuid("That is not a valid identifier.");

/**
 * Trims, then treats an empty result as absent.
 *
 * An HTML form submits every field it contains, so an untouched optional input
 * arrives as `""`. Stored as-is that becomes an empty string in the database
 * where the column means "not provided", and every downstream check for
 * `!== null` then reads it as provided.
 */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null);

export const requiredText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `Please keep ${label.toLowerCase()} under ${max} characters.`);

/**
 * A phone number, kept permissive on purpose.
 *
 * Locora is not tied to one country, and a strict pattern would reject a valid
 * number from somewhere the pattern's author did not think about — on the one
 * form where a rejection means a family cannot file a report. So: check it
 * plausibly is a phone number, and leave the formatting alone.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(6, "That phone number looks too short.")
  .max(32, "That phone number looks too long.")
  .regex(/^[+()\-.\s\d]+$/, "Use digits, spaces and the characters + ( ) - . only.")
  .refine(
    (value) => (value.match(/\d/g) ?? []).length >= 6,
    "Please include at least six digits.",
  );

/**
 * Cursor-free offset pagination.
 *
 * `limit` is clamped rather than rejected. These two values come from a query
 * string a person can edit in the address bar, and answering a hand-typed
 * `?limit=999` with a validation error breaks the page over something that has
 * an obvious sensible interpretation. The clamp still does the job that
 * matters: without an upper bound, one request is a way to make the database
 * build an enormous result set, and the caller asking for it is under no
 * obligation to be friendly.
 *
 * Request *bodies* are not treated this way — there, an out-of-range value is a
 * bug or an attack and gets a 422.
 */
const MAX_PAGE_SIZE = 60;

export const paginationSchema = z.object({
  offset: z.coerce
    .number()
    .int()
    .catch(0)
    .transform((value) => Math.min(Math.max(value, 0), 100_000)),
  limit: z.coerce
    .number()
    .int()
    .catch(24)
    .transform((value) => Math.min(Math.max(value, 1), MAX_PAGE_SIZE)),
});

export type Pagination = z.infer<typeof paginationSchema>;

/** The envelope every paginated list endpoint returns. */
export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * A date-time from a form or a query string.
 *
 * `z.coerce.date()` accepts anything `new Date()` does, which includes enough
 * nonsense to be worth narrowing. The bounds catch a mistyped year — a case
 * last seen in the year 202 or 20250 is a typo, not a record, and storing it
 * silently corrupts every date filter and sort the feed does.
 */
export const dateTimeSchema = z.coerce
  .date()
  .refine((date) => !Number.isNaN(date.getTime()), "That is not a valid date.")
  .refine((date) => date.getUTCFullYear() >= 1900, "That date is too far in the past.")
  .refine(
    (date) => date.getTime() <= Date.now() + 24 * 60 * 60 * 1000,
    "That date is in the future.",
  );

/** Turns a Zod failure into the per-field shape the API and the forms both use. */
export function toFieldErrors(error: z.ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join(".") || "_",
    message: issue.message,
  }));
}
