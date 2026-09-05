# Locora

**Find what matters.**

Locora is a platform for reporting missing people, reporting people who have been
found, and carefully bringing the two together. Families and members of the
public file reports; trained reviewers check them, publish them, and link the
ones that may describe the same person. Nothing is published automatically, and
no match is ever confirmed by software.

---

## Contents

- [What Locora does](#what-locora-does)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Running it locally](#running-it-locally)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Testing](#testing)
- [Deploying to Vercel](#deploying-to-vercel)
- [Security and privacy](#security-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Where assisted matching would go](#where-assisted-matching-would-go)

---

## What Locora does

Two kinds of report, filed independently by people who have never met:

**A missing-person report** — somebody knows who the person is and cannot find
them. It carries a name, an age, a description, where and when they were last
seen, and usually a photograph.

**A found-person report** — somebody has found a person who cannot say who they
are or where they belong. It carries an estimated age *range*, a description,
and where they were found. A photograph is optional by design, and where the
person is now is never published.

Between them sits a review process:

```
Report filed  ──►  Reviewer checks it  ──►  Published to the public feed
                          │                          │
                          ▼                          ▼
                   Declined, with a          Reviewer links it to a
                   reason the reporter        counterpart report
                   can read                          │
                                                     ▼
                                          Both families told it is a
                                          possibility, not a fact
                                                     │
                                          ┌──────────┴──────────┐
                                          ▼                     ▼
                                    Confirmed:            Ruled out:
                                    both cases closed     both back on the feed
```

A person makes every decision on that diagram. That is the product, not an
implementation detail: a false match here is not a bad recommendation, it is a
family being told something untrue about a missing relative.

### The walkthrough on the landing page

The whole of that diagram is also explained interactively at `/` under "See it
work, end to end" — ten chapters following one fictional case, about 2:25, with
play/pause, a chapter scrubber, captions and a transcript.

It is not a video file, and that is deliberate. A screen recording of this
interface would be several megabytes, resample badly on a high-density display,
be unreadable at phone width, carry no text a screen reader or a search engine
can use, and need re-recording every time the UI changes. The walkthrough is a
few kilobytes of DOM instead: crisp at any size, selectable, translatable, and it
cannot go stale the same way.

It is narrated. The audio element is mounted only once somebody presses play, so
nothing can sound before a deliberate gesture — which matters beyond browser
policy, since this page may be open in a waiting room. The preference is
remembered, and where the browser refuses to play the file the walkthrough runs
silently on its own clock rather than stalling.

It costs nothing until it is asked for — the player is dynamically imported when
somebody presses play, so a visitor who came to file a report does not download a
demonstration they never watched. Under `prefers-reduced-motion` it is replaced
by a storyboard: the same script as a readable document, with no playback.

The script lives in `src/components/demo/script.ts` as data. Both the captions
and the transcript render from it, so they cannot drift, and the wording is
reviewable as prose in a diff. Everything in it describes something the software
actually does; the single case used throughout is labelled "(fictional)" on
screen.

#### The narration is spoken copy, and is budgeted as such

The narration is recorded, and the script is written so that it could be
re-recorded without rewriting anything. That is a real constraint rather than an
aspiration: text that reads well is not automatically text that can be said
aloud in the time available, and an earlier revision of this script proved it —
403 words across 125 seconds, averaging 193 words per minute, with individual
chapters at 220. Good prose, unspeakable.

So every chapter's word count is checked against its duration, and the suite
fails if any of them leaves the 1.9–2.75 words-per-second band that unhurried
speech occupies. The transcript and the voiceover are deliberately the same
text: two versions would mean a deaf visitor reading a different account of the
product from the one a hearing visitor is told.

```bash
npm run narration                     # regenerate docs/NARRATION.md from the script
npm run narration:check               # fail if the document has drifted (runs in CI)
npm run narration:sync -- <audio>     # measure a recording; --write to adopt its timings
npm run record:walkthrough            # export an MP4, with the narration if present
```

`docs/NARRATION.md` is generated, checked in, and is what you would hand to a
voice artist or paste into a text-to-speech tool: direction, per-chapter
timecodes and word budgets, and a block containing nothing but the spoken words
plus `<break>` tags — no markdown, because an engine reads markdown aloud as
markdown. No paid service is involved, and nothing in the application waits on a
recording ever being made.

#### Cutting the picture to a real recording

A budget is a forecast, and a voice has no reason to match it. Left uncorrected
the error compounds — a chapter read a second quick shifts every chapter after
it, and by the tenth the caption describes something the narrator has finished
with. Nothing warns you; it simply feels slightly wrong.

So the timings are measured rather than assumed. `narration:sync` finds the
pauses between chapters with `silencedetect`, takes each chapter's real extent
from where the narrator actually stops and starts, and with `--write` records
them in `src/components/demo/timings.ts`, which the walkthrough prefers over its
own budget. The pauses are the reason this works at all: they are near-silent and
roughly a known length, which makes them findable.

The budget in `script.ts` is deliberately *not* overwritten. It is what the copy
was written for; replacing it with what a voice happened to do would let a rushed
take redefine "unhurried", and the speaking-rate check would then be validating
the script against itself. Keeping them apart is also what lets `narration:sync`
report that a delivery is faster than intended — which the current recording is,
at 168 words per minute against a 152 target.

Once measured, `record:walkthrough` muxes the audio in and writes a second,
narrated file. It refuses to do so if the timeline has *not* been measured
against that audio, because a video that looks right for one chapter and drifts
after it is harder to notice than one with no sound at all.

---

## Architecture

One Next.js application, deployed once. There is no separate backend service, no
container to operate, and nothing to run alongside it.

```
                    ┌──────────────────────────────┐
   Browser  ───────►│           Vercel             │
                    │                              │
                    │  Next.js 16 (App Router)     │
                    │  ├─ Server Components  ──────┼──► reads go straight to
                    │  │                           │    the query layer
                    │  ├─ Route Handlers     ──────┼──► writes, and the reads a
                    │  │                           │    client actually drives
                    │  └─ Middleware (Edge)        │
                    │        coarse redirects only │
                    └───────┬──────────────┬───────┘
                            │              │
                            ▼              ▼
                   ┌─────────────┐  ┌──────────────┐
                   │    Neon     │  │ Vercel Blob  │
                   │ PostgreSQL  │  │ photographs  │
                   └─────────────┘  └──────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ SMTP (opt.)  │
                    └──────────────┘
```

### Decisions worth knowing before you read the code

**Server Components read the database directly; only writes go through an API.**
The public feed and case pages call the query layer in the same process. Giving
them an API route would make the application fetch over HTTP from itself — a
second network hop and a second invocation to produce data the renderer could
already reach. Mutations *do* go through route handlers, because they need one
place for validation, rate limiting and a testable contract.

**Business logic is plain TypeScript that knows nothing about HTTP.** Everything
in `src/server/` takes values and returns values or throws `AppError`. Route
handlers are thin. This is what makes the interesting rules unit-testable
without a request object.

**Passwords use Node's built-in scrypt rather than Argon2id.** Argon2id is the
stronger first recommendation, so this is a trade rather than a default: the
Node Argon2 packages are compiled addons, and on a serverless platform the
failure mode of a native binary that stops matching its runtime image is that
nobody can sign in. A memory-hard KDF at 64 MiB per hash with zero native
dependencies is worth more here than the margin Argon2id holds over it. The
stored format carries its own cost parameters, so they can be raised later and
existing passwords still verify.

**Rate limiting is a Postgres table, not Redis and not an in-memory counter.** A
per-process counter is wrong on a platform that runs several instances: every
warm instance keeps its own, so the effective limit is silently multiplied by
however many are running. Redis would be a second vendor, a second credential
and a second thing to be down, to solve what one indexed table solves at this
scale.

**Drizzle over `pg`, not Neon's HTTP driver.** The HTTP driver is faster on a
single statement but cannot hold an interactive transaction, and several
operations here need one — rotating a refresh token, and creating a match, which
writes the link, moves two reports and queues two notifications atomically.
`pg` also speaks to any PostgreSQL, so local development, CI and the integration
suite all run against the same driver as production.

---

## Project structure

```
src/
  app/
    (site)/          Public pages: landing, case feed, case detail, safety
    (auth)/          Sign in, register, password reset, email confirmation
    (app)/           Signed in: dashboard, filing, notifications, settings
      review/        The reviewer console
    api/             Route handlers — writes, and client-driven reads
  components/
    ui/              The design system: button, field, card, dialog, toast…
    cases/           Case card, feed filters, photo gallery, map
    report/          Photo picker, location picker, filing outcome
    review/          Reviewer actions and the match builder
  db/
    schema.ts        The data model — the single source for migrations
    enums.ts         Domain enumerations, shared by the schema and the UI
    client.ts        Connection pooling
  lib/               Pure helpers shared by server and browser
    validation/      Zod schemas, used by both the forms and the handlers
  server/
    auth/            Passwords, tokens, sessions, guards
    reports/         Queries, writes, the status machine, and visibility
    matches/         Linking, deciding, and candidate ranking
    notifications/   In-app notifications
    admin/           Account moderation and the audit trail
    storage/         Upload validation and Vercel Blob
    email/           Delivery and templates
    security/        Rate limiting
    http/            Error types and the route wrapper
drizzle/             Generated SQL migrations — the only thing ever applied
tests/
  unit/              Pure logic and redaction
  integration/       The service layer against real PostgreSQL
  e2e/               Browser journeys against a production build
```

**The two files to read first** if you are picking this up:

- `src/server/reports/visibility.ts` — who may see what, and the only place that
  decides it.
- `src/server/reports/status.ts` — the case lifecycle, with no database or HTTP
  dependency so the rules are readable on their own.

---

## Running it locally

You need Node 22 or newer and a PostgreSQL 16 database.

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL
npm run db:migrate
npm run dev
```

The application is on <http://localhost:3000>.

With `EMAIL_BACKEND=console` (the default) nothing is sent — confirmation and
reset links are written to the terminal, which is where you will find them.

### Getting a database

Either a Neon branch, or a local container:

```bash
docker run --name locora-db -e POSTGRES_PASSWORD=locora \
  -e POSTGRES_USER=locora -e POSTGRES_DB=locora \
  -p 5432:5432 -d postgres:16-alpine
```

```
DATABASE_URL=postgres://locora:locora@localhost:5432/locora
```

### Making yourself a reviewer

Set `INITIAL_ADMIN_EMAIL` to the address you register with. It is granted
reviewer access on registration, or on the next `npm run db:migrate` if the
account already exists — either order works. Once that account can promote
others from the console, the variable can be removed.

There is deliberately no other way to create the first reviewer: a self-service
route would be an open privilege escalation, and a seeded account would be a
published credential.

---

## Environment variables

`.env.example` is the contract, and every variable there is labelled REQUIRED,
OPTIONAL or AUTO.

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL` | Always | Neon connection string. Use the **pooled** endpoint — the host containing `-pooler`. |
| `AUTH_SECRET` | Production | Signing key for session tokens. `openssl rand -hex 32`. Changing it signs everybody out. |
| `INITIAL_ADMIN_EMAIL` | Production | Grants reviewer access to exactly this address. |
| `BLOB_READ_WRITE_TOKEN` | Production | Vercel injects it once a Blob store is linked. |
| `NEXT_PUBLIC_SITE_URL` | Optional | Only for a custom domain; derived from Vercel's own variables otherwise. |
| `EMAIL_BACKEND` | Optional | `console` (default) or `smtp`. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_SECURE` / `EMAIL_FROM` | With SMTP | Any provider that speaks SMTP. |
| `REQUIRE_VERIFIED_EMAIL_TO_REPORT` | Optional | Defaults to `true`. Leave it on. |
| `TEST_DATABASE_URL` | Tests | The integration suite truncates it. Never point this at anything real. |
| `E2E_DATABASE_URL` | Tests | Same warning. |

A blank value counts as unset throughout. That is deliberate: a hosting
dashboard stores an empty string when somebody adds a variable before knowing
its value, and `??` would treat that as a real value and skip the default.

`assertProductionConfig()` refuses to build a production deployment that is
missing a signing key or a Blob token, or that selects SMTP with no host — so
those fail at deploy time with a list, rather than per-request in front of users.

---

## Database

Eleven tables. `src/db/schema.ts` is the source; `drizzle/` holds the generated
SQL, and only that SQL is ever applied.

```bash
npm run db:generate    # after changing schema.ts — review the SQL it writes
npm run db:migrate     # apply pending migrations
npm run db:studio      # browse the data
```

`drizzle-kit push` is deliberately not wired up as a script. It mutates a live
schema with no reviewable artefact, which is the wrong tool for a production
database.

Migrations also run as the first half of `npm run build`, so a Vercel deploy
applies them. That is safe here because every migration is additive, Drizzle
takes an advisory lock so concurrent deploys cannot double-apply, and with no
`DATABASE_URL` the step exits cleanly instead of failing.

**Do not remove the enum re-exports at the top of `schema.ts`.** Drizzle
discovers objects by walking that module's exports. An enum that is only
imported is invisible to the generator, which then emits tables referencing a
Postgres type it never wrote a `CREATE TYPE` for — and the migration fails on
the first table that uses one, at apply time rather than generate time.

---

## Testing

```bash
npm test                 # unit — pure logic, no database
npm run test:integration # the service layer against real PostgreSQL
npm run test:e2e         # browser journeys against a production build
npm run test:all         # unit and integration
```

Integration and end-to-end tests each need their own database, named by their own
variable, because both empty it:

```bash
TEST_DATABASE_URL=postgres://locora:locora@localhost:5432/locora_test npm run test:integration
E2E_DATABASE_URL=postgres://locora:locora@localhost:5432/locora_e2e   npm run test:e2e
```

With `TEST_DATABASE_URL` unset the integration suite skips with instructions
rather than failing, so `npm test` stays useful before you have provisioned one.

### What each layer is for

**Unit** covers the rules where a mistake is silent: the status machine is tested
exhaustively rather than by example, because a wrong edge does not throw — it
strands a case in a state no reviewer can act on. Redaction is asserted against
the *serialised output*, not the projection's intent, so a field that starts
leaking is caught.

**Integration** runs the real service layer against real PostgreSQL, and is
written as attempts rather than rules: can a stranger read a declined report, can
somebody change another person's photographs, can a reviewer suspend themselves
or demote the last reviewer. The rate limiter is only tested here, because the
property that matters is that the counter is *shared* — a per-process one passes
every in-memory test while being wrong in production.

**End-to-end** checks what the other two cannot: that private fields are absent
from the rendered HTML rather than merely from a projection, that an unreviewed
case is unreachable in a browser, and that the layout does not scroll sideways at
320px — on the signed-in pages as well as the public ones. It runs on a desktop
and a phone viewport.

### Looking at it

```bash
# with a server already running against the e2e database
SHOT_BASE_URL=http://127.0.0.1:3200 node scripts/screenshot.mjs
```

Captures the 26 main screens at desktop and phone widths into `.shots/`. It is
not a test and asserts nothing — it exists because a page can satisfy every
locator in the suite and still be misaligned, clipped, or broken at a width
nobody enumerated. Three of the four defects fixed in the last UI pass were found
this way and by no test: a review console that overflowed a phone viewport by
275px, filter labels silently truncated inside a native select, and a form field
sitting a row below its neighbours because its unit was a hint rather than part
of its label.

---

## Deploying to Vercel

1. **Create a Neon database.** Copy the **pooled** connection string — the host
   containing `-pooler`.
2. **Import this repository into Vercel.** Framework and build command are
   detected; nothing needs overriding.
3. **Create a Blob store** on the project's Storage tab. Vercel injects
   `BLOB_READ_WRITE_TOKEN` itself.
4. **Add the environment variables:**
   - `DATABASE_URL` — from step 1
   - `AUTH_SECRET` — `openssl rand -hex 32`
   - `INITIAL_ADMIN_EMAIL` — the address you will register with
   - optionally `EMAIL_BACKEND=smtp` and the `SMTP_*` values
5. **Deploy.** The build applies migrations, then compiles.
6. **Register with the address from step 4**, and you have reviewer access.

There is nothing else to operate. No container, no separate API deployment, no
reverse proxy, no scheduled job — expired tokens and closed rate-limit windows
are purged opportunistically by the health endpoint, which any uptime monitor
will be hitting anyway.

### Checking a deployment

`/api/health` returns `{"status":"ok"}` to anyone. Signed in as a reviewer it
also reports database latency, whether email is actually delivering, and whether
photo storage is configured — deliberately not to anonymous callers, because
"email is not delivering" tells an attacker that password-reset notices go
nowhere.

---

## Security and privacy

The user-facing description is at `/safety`, and it names the file that enforces
each claim. In summary:

- **Contact details are never sent to a stranger.** A public request is answered
  with a response that has no contact fields in it at all — they are not sent and
  then hidden. Public queries do not even select those columns.
- **Every projection names each field it returns.** Copying the row and deleting
  sensitive keys would be shorter and is exactly the bug: the next column added
  would be published by default.
- **Unreviewed and declined cases are not readable**, and refusal is a 404 rather
  than a 403 — a 403 confirms the case exists.
- **Sessions** are httpOnly cookies; refresh tokens rotate on every use and a
  replayed one revokes every session on the account.
- **A ban takes effect on the next request**, which is why the user row is loaded
  rather than the access token's claims trusted.
- **Uploads are validated by magic number**, and the sniffed type — never the
  declared one — is what gets stored and re-served.
- **Logs redact by key pattern** before serialising, and ESLint blocks bare
  `console.log` outside scripts.
- **Every reviewer action is audited**, and the audit metadata refuses personal
  data — otherwise the log becomes a second, unredacted copy of what it audits.

Locora holds no security certification and no compliance audit, and has no
partnership with any police force, government body or charity. If you see such a
claim attached to this product, it did not come from here.

---

## Troubleshooting

**`DATABASE_URL is not set`** — copy `.env.example` to `.env.local` and fill it
in. A blank value counts as unset.

**`relation "..." does not exist`** — run `npm run db:migrate`.

**Migration fails on `CREATE TYPE`** — an enum is missing from the re-export list
at the top of `src/db/schema.ts`. See the note under [Database](#database).

**No confirmation email** — on the default `console` backend nothing is sent; the
link is in the server output. With SMTP, check `/api/health` as a reviewer: it
reports whether delivery is actually configured.

**Everybody was signed out after a deploy** — `AUTH_SECRET` changed. Every
session token was signed with the previous value.

**Intermittent `InvalidSQLStatementName` under load** — `DATABASE_URL` is
pointing at Neon's *direct* endpoint rather than the pooled one.

**Photo upload fails in production** — `BLOB_READ_WRITE_TOKEN` is missing. Link a
Blob store to the project; Vercel injects it.

---

## Known limitations

Stated plainly rather than left to be discovered. See
[docs/KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md) for the detail.

- A non-existent case URL renders the correct not-found page but answers **200
  rather than 404**. It affects crawlers and uptime monitors, not people.
- **Email delivery has not been tested against a real SMTP provider.** The code
  path, the templates and the failure handling are exercised on the console
  backend only. Nothing in this repository has sent an email.
- **Photo upload has not been exercised against a real Blob store**, for the same
  reason — it needs a credential this repository does not have. Validation,
  sniffing and the size limits are tested directly.
- There is **no automated accessibility audit**. The specific properties the
  product committed to are asserted in the browser; a general audit is not run.
- There is **no error-monitoring integration**. Errors are logged as structured
  JSON with a request id, which a platform log drain can collect.

---

## Where assisted matching would go

The schema is ready for it and nothing writes it today. `matches.source` and
`matches.confidence_score` exist so a matcher can insert scored rows with no
migration, and the reviewer console already filters on `status = 'possible'`
regardless of what created the row.

```
Report  ──►  Feature extraction  ──►  Candidate scoring  ──►  matches row
                                                              (source =
                                                               'automated')
                                                                    │
                                                                    ▼
                                                          A reviewer confirms
                                                          or rules it out
```

The console shows a "suggested automatically" badge on any such row, so a
reviewer confirming a machine suggestion knows that is what they are doing.

The constraint that must not be relaxed: **nothing resolves a case without a
person**. Today's `suggestCandidates` already reflects that — it ranks by age
overlap, gender, city and timing, and returns the reason for every contribution,
so a reviewer can see a case ranked highly because of the city rather than
reading a number as a probability. Any future scorer should be presented the same
way. A percentage next to a photograph invites trusting arithmetic over
judgement, on the one decision where being wrong means telling a family something
untrue about their child.
