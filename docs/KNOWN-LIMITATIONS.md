# Known limitations

Everything on this page is a thing Locora does not do, or does imperfectly. It
exists so that nobody has to discover these by hitting them, and so that a claim
made anywhere else in this repository can be trusted to be the whole picture.

Each entry says what the limitation is, what it costs, and what fixing it would
take.

---

## A missing case answers 200 instead of 404

**What happens.** Visiting `/cases/missing/<an id that does not exist>` renders
the not-found page correctly — the heading, the explanation that a resolved case
is removed, the links out. The HTTP status is `200` rather than `404`.

**Why.** The response has begun streaming by the time the page component runs,
so the status line is already on the wire when `notFound()` is reached. A bare
`notFound()` on a simpler route under the same layout *does* return 404, and
removing this route's `force-dynamic` and its parent `loading.tsx` did not change
it, so it is specific to this route rather than a general property of the app.

**What it costs.** A crawler may treat a dead case URL as a live page — the
classic soft-404 — and an uptime monitor cannot distinguish "case gone" from
"case served". A person sees the right page and the right words. No data is
exposed and nothing is broken.

**Mitigations already in place.** Case pages are served `Cache-Control: private,
no-store`, found-person cases are disallowed in `robots.txt`, and the sitemap
lists only cases that currently exist — so the set of dead URLs a crawler can
reach is small and shrinking rather than advertised.

**What a fix looks like.** Establishing existence before the response starts:
either resolving the case in `generateMetadata` and caching it for the render, or
a route-level check that can reject before streaming. Both need more
investigation of how this particular route commits its status than was warranted
against the cost.

**Verified in.** `tests/e2e/public-journey.spec.ts` asserts the rendered content
and says explicitly why it does not assert the status; the neighbouring test
confirms an unmatched route still returns a real 404, which is what shows the
not-found page itself is wired up correctly.

---

## Email delivery has never been tested against a real provider

**What happens.** With `EMAIL_BACKEND=console` — the default, and what every test
runs on — messages are written to the server log instead of being sent. Nothing
in this repository has ever sent an email.

**What is tested.** That a confirmation token is issued, hashed, single-use, and
invalidated when a new one is issued; that a reset consumes its token and revokes
every session; that registration reports honestly whether the message was handed
off. The SMTP transport, the templates' rendering in real clients, and any
provider's deliverability are not.

**What it costs.** The first real deployment is the first real test of SMTP. A
misconfiguration shows up as confirmation links never arriving.

**How to check it quickly.** Set `EMAIL_BACKEND=smtp` and the `SMTP_*` values,
then sign in as a reviewer and open `/api/health`: it reports whether delivery is
configured, which distinguishes "not sending" from "sending and failing". Then
register a throwaway account and confirm the link arrives.

**Failure is already non-fatal.** Sending never fails the action that raised it —
an account is created whether or not its email leaves, and the interface says
which happened rather than claiming "check your inbox" for a message that was
never sent.

---

## Photo upload has not run against a real Blob store

**What happens.** Uploading needs `BLOB_READ_WRITE_TOKEN`, which is a credential
this repository does not have. The end-to-end suite runs with a placeholder and
does not exercise the upload path.

**What is tested.** Magic-number sniffing for all three accepted formats and for
things pretending to be them, the mismatch between a declared and an actual type,
the empty file, the per-file and per-request size limits, and the per-report
count cap — all directly, against real buffers.

**What is not.** The round trip to Vercel Blob, and therefore the exact shape of
the URL and pathname it returns.

**How to check it.** Link a Blob store, file a report with a photograph, and
confirm it appears on the case page.

---

## Photograph URLs are unguessable, not access-controlled

**What this means.** A photograph lives at a public Blob URL with a
32-hex-character random path. Anybody given that URL can load the image without
signing in.

**Why it is this way.** The alternative — proxying every image through an
authenticated route — would put a serverless invocation and a database lookup in
front of every thumbnail on the feed, and would make a public case feed, whose
entire purpose is for a stranger to recognise a face, unable to show one.

**What bounds it.** The URL is never included in a response for a case the caller
may not see, case pages are `no-store`, found-person cases are noindexed and
disallowed to crawlers, and photographs are deleted from the store when a case is
taken down — which revokes the capability.

This is documented at `/safety` in the product itself, not only here.

---

## No automated accessibility audit

**What is asserted**, in a real browser, on both a desktop and a phone viewport:
one `<h1>` per page; a working skip link; real labels on every form control;
`aria-invalid` and `aria-describedby` on a failed field; alternative text on every
image; a declared document language; uncapped zoom; no horizontal overflow at
320–1440px; and discrete controls at least 24px tall.

**What is not.** A general audit — axe, Lighthouse or similar — is not run.

**Why.** Automated audits catch a narrow band of issues and give a false sense of
coverage for everything else, and their output tends to be suppressed rather than
fixed. The properties above were chosen because each is a real failure for a real
person. That is a reason for the choice, not a claim that it is sufficient: a
manual audit with a screen reader has not been done, and should be before this
serves the public.

---

## No error-monitoring service

Errors are logged as structured JSON with a request id, and the id is returned to
the client on a 500 so a support conversation can find the exact line. There is
no Sentry or equivalent.

Adding one is a small change — the single wrapper in `src/server/http/handler.ts`
is where every unhandled error already passes. The reason it is not done is that
an error reporter on this product needs care: stack frames and request context
routinely carry personal data, and shipping that to a third party is exactly the
thing the logger's redaction exists to prevent. It should be added deliberately,
with scrubbing configured, rather than dropped in.

---

## Operational gaps

**No scheduled jobs.** Expired refresh tokens, spent verification tokens and
closed rate-limit windows are purged opportunistically by `/api/health`, so a
deployment needs no cron. If nothing ever calls that endpoint, those rows
accumulate. Any uptime monitor solves it.

**No backups configured.** Neon's own point-in-time restore covers this, but it
is a setting on the database rather than something this repository can assert.

**Single reviewer role.** There is one privilege level above a standard account.
A larger operation would want to separate "can publish a report" from "can
suspend an account" — the audit trail already records which action was taken, so
the distinction exists in the data before it exists in the roles.

**Email address changes are not self-service.** Doing it safely needs a
confirm-the-new-address-before-switching flow, and a half-built version that
switches first hands the account to whoever typed the new address. The settings
page says so rather than offering a field that quietly does the wrong thing.

---

## The product walkthrough is not a recorded video

**What it is.** The "See how Locora works" experience on the landing page is a
scripted animated walkthrough rendered as DOM and SVG — ten chapters, about
2:34, with play/pause, a chapter scrubber, captions and a transcript. That is
what the site serves; no video file is committed to this repository.

An MP4 *export* can be produced from it — `npm run record:walkthrough`, with the
recorded narration muxed in when one has been measured — but it is a build
product rather than a source file, and `.gitignore` keeps it out. Several
megabytes of binary that change wholesale on any visual edit is the one thing a
git history should not carry.

**Why.** A screen recording of this interface would be several megabytes,
resample badly on a high-density display, be unreadable at phone width, carry no
text a screen reader or a search engine can use, need re-recording on every UI
change, and — if hosted on a third-party player — cost a cross-origin script, a
CSP entry and tracking before anybody pressed anything. The walkthrough is a few
kilobytes, crisp at any size, selectable, translatable and accessible.

**What it costs.** Two things a recorded film would give and this does not:

- It shows stylised abstractions rather than a recording of the interface (see
  below).
- It has to be re-exported rather than re-uploaded when the UI changes.

The two costs that used to be listed here no longer apply, and are recorded
because the correction is the interesting part:

- **It is narrated.** The walkthrough plays the recorded voice-over, mounted only
  after somebody presses play so that nothing can sound unbidden — this page may
  be open in a waiting room. The audio's own position drives the timeline, so
  the captions cannot drift from the voice, and the preference to mute is
  remembered. Where a browser refuses to play the file the walkthrough runs
  silently on its own clock rather than stalling.
- **It can be posted elsewhere.** `npm run record:walkthrough` exports a 1080p
  MP4 with the narration muxed in.

Worth naming plainly: for a while the exported video carried the voice and the
deployed page did not, and the whole suite was green throughout, because nothing
in it listened. `tests/e2e/walkthrough-narration.spec.ts` now asserts that the
browser fetches the file, that `paused` actually goes false after a click, and
that muting stops it.
- It shows stylised abstractions of the interface rather than the interface
  itself. That is deliberate — the abstractions cannot go stale, and carry no
  fabricated personal data — but somebody who wants to see the *actual* product
  moving will not see it here.

**What producing a real film would take, if you want one.** The script is already
written, timed and rate-checked: `src/components/demo/script.ts` holds ten
chapters with narration and durations totalling 2:25, and `docs/NARRATION.md` is
the recording script generated from it. Every line is budgeted inside the
speaking-rate band an unhurried narrator can sustain, so it can be handed
straight to a voice artist or a text-to-speech tool without being rewritten
first. What remains is outside what this repository can do — recording the real
interface against seeded demo data, the voice work itself, and editing. If you do
commission one, the honest place for it is *alongside* this walkthrough rather
than replacing it: the accessible, always-current version should stay.

**Not a limitation.** The walkthrough is tested (`tests/unit/demo-script.test.ts`)
for its timing arithmetic, for the claims in its script — a statistic, a named
organisation, or the removal of either sentence about human review will fail the
suite — and for whether each line can actually be spoken in the time its chapter
allows.
