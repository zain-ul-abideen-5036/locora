# Brain

Compact, load-bearing notes for future work on Locora. Not a doc set — see
`README.md` for architecture and `docs/KNOWN-LIMITATIONS.md` for everything the
product does not do.

## State

- **`main` is at `6a9659c`** — merge of PR #1 (`test/production-ui-ux-demo-admin`).
  Working tree clean, branch pushed, PR merged.
- **All suites green on `main`**: tsc, eslint (0 errors, 0 warnings), 108 unit,
  92 integration, 64 e2e (desktop + mobile), production build (35 routes).
- **Never deployed by me.** Vercel deployment is the owner's step.

## Local environment

- **Postgres is a Docker container**, `backend-db-1`, left over from the earlier
  FindMe project. Postgres 16, `findme`/`findme`, port 5432. Two databases were
  created for this work and both get **truncated** by their suites:
  - `locora_test` → `TEST_DATABASE_URL`
  - `locora_e2e` → `E2E_DATABASE_URL`
  ```bash
  TEST_DATABASE_URL=postgres://findme:findme@localhost:5432/locora_test npm run test:integration
  E2E_DATABASE_URL=postgres://findme:findme@localhost:5432/locora_e2e   npm run test:e2e
  ```
- **`pkill` does not kill Node on this machine.** Use PowerShell:
  `Get-NetTCPConnection -LocalPort 3200 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
- **Visual review**: seed, start `next start` on 3200 against `locora_e2e`, then
  `SHOT_BASE_URL=http://127.0.0.1:3200 node scripts/screenshot.mjs`. Writes 26
  screens to `.shots/` (gitignored). **Always `next start`, never `next dev`** —
  and always restart the server after a rebuild, or it serves chunk names the
  new `.next` no longer has and every asset 500s as `text/plain`.

## Prior art

The predecessor, **FindMe**, is at `C:\Users\MK\Downloads\findme-main\findme-main`
(FastAPI + Next.js, 49 commits, remote `findme.git`). Locora was written fresh in
TypeScript but its schema, the public/owner/reviewer redaction split, refresh-token
reuse detection and eight documented bug fixes all derive from auditing it. Worth
re-reading before changing the domain model; not worth copying code from.

## Decisions not to re-litigate

Each of these was argued through and is documented at its call site.

- **No bulk actions in the review queue.** Publishing exposes a named child's
  photograph; declining sends a family a written reason. Both are per-case
  judgements, and "select all → publish" is a button whose only purpose is to
  skip the review the product exists to perform.
- **The walkthrough is DOM, not an `.mp4`.** Reasons and the three things a real
  film would add are in `docs/KNOWN-LIMITATIONS.md`. `src/components/demo/script.ts`
  is already a timed shooting script if one is ever commissioned.
- **scrypt, not Argon2id.** Node built-in, so the deployed bundle carries no
  native binary — on serverless, an addon that stops matching its runtime image
  means nobody can sign in. ~200ms/hash, login path only.
- **Report forms are an index, not a wizard.** A wizard loses every answer on
  refresh; unacceptable on a form about a missing relative.
- **Filters are GET forms writing to the URL**, not React state. Shareable,
  Back-able, works before JS.
- **Rate limiting is a Postgres upsert**, not Redis and not a Map. A per-process
  counter multiplies every limit by the number of warm instances.
- **Case pages 404 rather than 403** for a case the viewer may not see — a 403
  confirms the case exists.

## Traps already hit

- **Drizzle only emits `CREATE TYPE` for enums exported from the schema entry
  point.** They were merely imported, so migrations generated fine and failed on
  apply. `src/db/schema.ts` re-exports them with a comment saying why.
- **`src/server/config/env.ts` snapshots `process.env` at import.** Test setup
  must set `DATABASE_URL` at *module scope*, not in `beforeAll` — too late there.
- **A grid item's default `min-width: auto` defeats `overflow-x-auto` on its
  child.** This overflowed every `/review` page by 275px on a phone. `min-w-0` on
  the item, not the scroller.
- **jsdom's `Uint8Array` is not Node's**, so `jose` rejects a valid key. Token
  tests carry `@vitest-environment node`.
- **React 19's `react-hooks/set-state-in-effect` is enforced.** External state
  (`matchMedia`, `localStorage`) goes through `useSyncExternalStore`; prop-derived
  state is adjusted during render against the previous props.

## Verified vs not

- **Verified live**: sign-in/out, registration, session rotation and reuse
  detection, report filing, review decisions, matching, notifications, redaction
  (asserted against rendered HTML, not just projections), rate limiting under
  real concurrency, responsive layout at 320–1440px on public *and* signed-in
  pages.
- **Never run for real**: SMTP delivery (every test uses `EMAIL_BACKEND=console`)
  and Vercel Blob upload (no `BLOB_READ_WRITE_TOKEN`). Both are first-deploy
  risks. `/api/health`, signed in as a reviewer, reports which of the two are
  configured — that distinguishes "not sending" from "sending and failing".

## Owner's outstanding steps

1. Neon database → `DATABASE_URL` (pooled endpoint, the host with `-pooler`).
2. Vercel Blob store → `BLOB_READ_WRITE_TOKEN` (injected automatically once linked).
3. `AUTH_SECRET` — `openssl rand -hex 32`.
4. `INITIAL_ADMIN_EMAIL` — the only way to create the first reviewer.
5. SMTP values if email should actually send; `EMAIL_FROM` must be a domain
   verified at the provider, and the code default (`no-reply@locora.app`) is a
   domain nobody owns.
