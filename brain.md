# Brain

Compact, load-bearing notes for future work on Locora. Not a doc set — see
`README.md` for architecture and `docs/KNOWN-LIMITATIONS.md` for everything the
product does not do.

## State

- **`main` carries PR #2** (`test/final-product-polish`) on top of PR #1.
  Working tree clean.
- **All suites green on `main`**: tsc, eslint (0 errors, 0 warnings), 112 unit,
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
- **The transcript and the voiceover script are one text, not two.** Two would
  mean a deaf visitor reading a different account of the product from the one a
  hearing visitor is told. The cost is that `narration` has to satisfy both, so
  it is budgeted by speaking rate — see below.
- **The narration plays on the site, and the audio element is the clock.**
  `public/walkthrough-narration.mp3` is committed and served; the player reads
  `audio.currentTime` rather than running a counter beside it, because two
  clocks drift and a per-cent across 2:34 is a caption on the wrong chapter.
  Muted or blocked, it falls back to the frame delta.
- **`<audio>` starts at `volume = 1`.** Easing toward a quiet target from the
  default means the track opens at full volume for the ramp's duration —
  measured 0.76 against a 0.16 target. Set the level before `play()`, and ease
  only between subsequent targets.
- **An icon-only button needs an `sr-only` label, not just a hidden one.** The
  transcript button's label was `hidden sm:inline`, so on a phone it had no
  accessible name at all — the icon is `aria-hidden`. Found by a test that
  addressed it by role on mobile. Use `sr-only sm:hidden` alongside the visible
  text rather than `aria-label`, which would override the visible text and let
  the two drift.
- **Music never goes into `walkthrough-narration.mp3`.** `sync-narration` finds
  chapter boundaries by silence; a bed fills the silences and takes the detector
  from 10 gaps to 0. Proven, not assumed. Music is mixed only at export.
- **Normalise a bed by loudness, never by a dB offset.** A synth bed and a
  mastered track are ~20 LUFS apart, so one offset cannot suit both.
  `loudnorm` plus sidechain ducking puts anything in the right place.
- **A composed track needs `dynaudnorm` before `loudnorm`.** `loudnorm` sets one
  level for the whole file and says nothing about variation inside it. The
  licensed track ranged 14.6dB between its peak and its breakdown, and a 14dB
  drop under narration reads as the music having stopped rather than as
  dynamics. Levelling first brings the spread to ~3dB. Trimming cannot avoid a
  quiet passage that sits near the middle of the source.
- **Do not hide background audio below the speech band.** Putting the bed under
  300Hz avoids masking and makes it inaudible: laptop and phone speakers roll
  off hard below 300-400Hz, so 100% of its energy was in the one band the
  playback device cannot reproduce. Keep music in 220Hz-2kHz and control it
  with level and ducking. Measure energy *above 200Hz*, not just overall dBFS —
  the overall figure looked fine while the bed was silent in practice.
- **The transcript, the voiceover script and the timeline are one system.**
  `docs/NARRATION.md` is generated from `script.ts`; the timeline is measured
  from the recording into `timings.ts`; the exported MP4 is cut to that. Change
  one and regenerate the rest — `narration`, `narration:sync`,
  `record:walkthrough`.
- **The budget and the measurement are separate on purpose.** `script.ts` holds
  what the copy was written for and governs the speaking-rate test;
  `timings.ts` holds what a voice did and governs the timeline. Overwriting the
  former with the latter would let a rushed take redefine "unhurried" and the
  test would validate the script against itself.

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
- **Prose that reads well is not prose that can be spoken.** The walkthrough
  narration once averaged 193 wpm and peaked at 220. Nothing looked wrong. The
  band is now enforced per scene (never on the average — an average hides one
  dense scene between two sparse ones, which is the case a narrator cannot
  deliver).
- **`ml-auto` does nothing in a shrink-to-fit flex container.** There is no free
  space for it to consume. It appeared to separate the decline button and
  separated nothing except on a phone, where the button wraps to a full-width
  line. Measure the rendered box; do not read the class name.
- **A `col-span-*` has to be on the direct grid child.** Put on a node one level
  inside a `Reveal` wrapper it is inert, the wrapper falls back to a single
  track, and the panel renders one word wide.
- **`tsx` transpiles `scripts/*.ts` to CommonJS.** No top-level `await`, and no
  `import.meta.dirname`. Follow the `main().catch(…)` convention the other
  scripts use, and resolve paths from `process.cwd()`.
- **A rendered `<break time="2s" />` is not two seconds.** In the committed
  recording the ten came back between 2.06s and 2.37s. Assuming the nominal
  value walks the picture off the voice by about a third of a second per
  chapter. Measure the gaps; do not trust the tag.
- **Never compare a measured number to a budgeted one.** Scene `arrive` is
  10.9s measured in total and 11.0s budgeted for speech *alone*, so the obvious
  assertion "a scene outlasts its speech" fails on data that is perfectly
  correct. Same source on both sides, always.
- **The Bash tool mangles `\n` inside heredocs**, so patching TypeScript
  string literals with a python heredoc turns `
` into real newlines and
  produces unterminated strings. Use the Edit tool for anything containing
  escapes.
- **Every screenshot review was in the light theme.** That is how a caption of
  `text-white` on `bg-ink/85` shipped: `--ink` is near-white in dark mode, so it
  was white on white at about 1.1:1. Colour pairs must come from matched tokens
  (`bg-ink`/`text-ink-inverse`), and any visual review has to cover both themes.
- **`aspect-*` is a floor, not a ceiling.** Content taller than the box grows
  it. The walkthrough stage was 239px on some chapters and 290px on others, so
  the page jumped on every scene change — while the class was there specifically
  to stop that. Use a fixed height where a constant is what you actually need.
- **An overlay that works on a desktop can be sitting on the content on a
  phone.** The caption covered 10–55px of every scene at 390px. Below `sm` it
  gets its own band; one element positioned differently, never two, or a screen
  reader announces the live region twice.
- **A green suite proves nothing about what it does not check.** The exported
  video had the narration while the deployed page was silent, through several
  full runs, because no test listened. If a capability is claimed, assert the
  capability — not the markup that ought to imply it.
- **Desktop dead space does not show up in any test.** The walkthrough scenes
  filled 17–34% of their stage and every suite passed. `scripts/screenshot.mjs`
  plus a throwaway Playwright measuring script is how that was found; measuring
  beats looking, and looking beats asserting.

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
