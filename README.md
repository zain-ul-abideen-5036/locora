<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/mark-dark.svg" />
  <img src="public/brand/mark.svg" alt="Locora logo" width="88" height="88" />
</picture>

<h1>Locora</h1>

<h3>Find what matters.</h3>

<p>
  <b>Locora is where a missing person and a found person are brought together by a human being.</b><br />
  Families and members of the public file reports. Trained reviewers check them, publish<br />
  them, and link the ones that may describe the same person. Nothing is published<br />
  automatically, and no match is ever confirmed by software.
</p>

<p>
  <a href="TECHNICAL_README.md"><b>Technical Documentation&nbsp;&rarr;</b></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#quickstart">Quickstart</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#inside-the-app">Screenshots</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#what-you-can-do">Features</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#how-it-works">How it works</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#built-with">Built with</a>
</p>

</div>

<br />

<img src="docs/screenshots/home-hero.png" alt="The Locora landing page: the headline Find what matters, beside four portrait tiles with a line drawn between two of them, and a note that two cases are published right now" width="100%" />

---

## The problem it solves

Reuniting people is, on the face of it, a matching problem — and matching
problems are what software is good at. That is the trap.

A platform that compares a missing-person report with a found-person report and
puts **94% match** on the screen has made a claim it cannot support. The two
records agree on a city, an age range and a jacket. That is not a probability,
and a family reading it will not treat it as one. The cost of being wrong here
is not a bad recommendation: it is telling a mother her daughter may have been
found, and being mistaken.

So Locora draws the line in one specific place, and draws it hard. **Software
narrows. People decide.** The candidate ranking exists, it is good, and it
cannot close a case, publish a report, or tell anybody anything.

**Who it is for**

- A family who has just realised somebody is missing, and needs a place to put
  what they know where it might be recognised
- A hospital, a shelter, or a stranger who has found a person unable to say who
  they are or where they belong
- Anybody willing to look at a public feed of faces, which is the single most
  valuable thing that happens on this platform
- Anyone reading it as a reference implementation: a full-stack Next.js
  application with real authentication, a pure domain layer under test, and an
  authorization model that is enforced in one place and asserted from a browser

**What makes it different**

|                                     |                                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nothing publishes itself**        | Every report waits for a person to read it. A reviewer publishes it, or declines it with a written reason the reporter can read — and a decline is never a dead end.                              |
| **A match is never a number**       | The ranking states its reasons in words: *found in Lahore, where they were last seen*; *estimated age is consistent*. A percentage next to a photograph invites trusting arithmetic over judgement. |
| **Contact details are not sent**    | A public request is answered by a query that does not *select* those columns. They are not fetched and then hidden, because the next column somebody adds would be published by default.           |
| **Where a found person is stays private** | The most sensitive field in the database. Published openly it would tell anyone — including whoever a person may have fled — exactly where to find a vulnerable adult or child.               |
| **Every claim names its enforcer**  | The `/safety` page does not ask to be trusted. Each section says what the software does and names the file that does it, so the claim can be checked rather than believed.                         |

---

## Quickstart

**Requirements:** Node.js 22+, npm, and a PostgreSQL 16 database.

```bash
git clone https://github.com/zain-ul-abideen-5036/locora.git
cd locora
npm install

cp .env.example .env.local
# Fill in DATABASE_URL, and generate a signing key for AUTH_SECRET:
openssl rand -hex 32

npm run db:migrate
npm run dev          # http://localhost:3000
```

No database to hand? One container is enough:

```bash
docker run --name locora-db -e POSTGRES_PASSWORD=locora \
  -e POSTGRES_USER=locora -e POSTGRES_DB=locora \
  -p 5432:5432 -d postgres:16-alpine
```

Register an account and file a report. On the default `EMAIL_BACKEND=console`
nothing is sent anywhere — confirmation and reset links are printed to the
terminal you ran `npm run dev` in.

To give yourself the reviewer console, set `INITIAL_ADMIN_EMAIL` to the address
you register with. There is deliberately no other way to create the first
reviewer: a self-service route would be an open privilege escalation, and a
seeded account would be a published credential. Full setup, every environment
variable and deployment:
**[Technical Documentation →](TECHNICAL_README.md#running-it-locally)**

---

## Inside the app

### The decision the whole product is built around

A reviewer picks a missing-person case and Locora ranks the found-person
reports worth comparing. Every row states, in words, what the two records have
in common — and the only thing that turns a candidate into a link is the button
at the bottom, pressed by a person.

<img src="docs/screenshots/review-match-builder.png" alt="The reviewer console's match builder: a missing-person case selected, and one ranked candidate found in Lahore on 3 August 2026 with a badge reading four in common and the reasons listed — found in Lahore where they were last seen, estimated age is consistent, same recorded gender, found after they were last seen — beside a Link as possible match button" width="100%" />

Note what the badge says. **4 in common** — not 94%. The reasons *are* the
ranking; there is no hidden score being translated into English after the fact.
A reviewer can see that a case ranked highly because of the city, and weigh that
themselves.

### The queue, where nothing is public yet

<img src="docs/screenshots/review-queue.png" alt="The review queue: one missing-person report awaiting review, showing the reporter's private contact details, with Publish, Mark in review and Decline actions, under a banner reading that every action is recorded against your account" width="100%" />

Every report lands here and stays here. The header says that every action is
recorded against the reviewer's account and that some are visible to the
reporter immediately — which is the point. This is a privileged console, and it
should feel like one.

There is no "select all → publish". A bulk control on this screen would be a
button whose entire purpose is to skip the reading.

### A case, and the wall down the middle of it

<table>
<tr>
<td width="50%"><img src="docs/screenshots/cases-desktop.png" alt="The public case feed with tabs for missing people and people found, a search box, a city filter and a sort control, above a card for a published case" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/case-page.png" alt="A published case page showing last seen details, case progress, description, an approximate-area map, and a panel marked Private to you containing the contact name, phone, email and police reference" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>The feed</b> — every case here was read and published by a person</td>
<td align="center"><b>The case</b> — and the panel a stranger's request never selects</td>
</tr>
</table>

The map is deliberately approximate, and says so underneath it. The **Private to
you** panel is the interesting half: those fields are not hidden with CSS or
stripped in the browser. A public request for this page runs a different query —
one that does not name those columns at all.

### Filing, and what happens next

<table>
<tr>
<td width="50%"><img src="docs/screenshots/report-missing.png" alt="The missing-person report form: name, age, gender and height fields, what they were wearing and distinguishing features, beside a progress panel listing four sections and a note that nothing is submitted until the button at the end" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/dashboard.png" alt="The reporter's dashboard: one report awaiting review, and two published cases shown exactly as a stranger sees them" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Only the name is essential</b> — anything you are unsure of can be left blank</td>
<td align="center"><b>My reports</b> — with a reviewer, or published, and never in doubt which</td>
</tr>
</table>

The form is written for somebody having the worst day of their life. Fields are
optional wherever they can be, the progress panel says *nothing is submitted
until you press the button at the end*, and the dashboard labels its published
section **this is what a stranger sees**.

### The walkthrough, which is not a video

<table>
<tr>
<td width="50%"><img src="docs/screenshots/demo-playing.png" alt="The landing page walkthrough mid-play: a miniature of the Locora interface with a caption reading a family member is missing, somebody looks for a place to report it, above a transport bar with pause, chapter skip, a timecode of 0:02 of 2:34, mute and transcript controls" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/demo-transcript.png" alt="The same walkthrough with the transcript panel open, showing the spoken narration as readable text" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Ten chapters, 2:34</b> — narrated, captioned, scrubbable, mutable</td>
<td align="center"><b>The transcript</b> — the words the narrator says, not a summary of them</td>
</tr>
</table>

It is a few kilobytes of DOM rather than a screen recording. A video of this
interface would be several megabytes, resample badly on a high-density display,
be unreadable at phone width, carry no text a screen reader or a search engine
can use, and need re-recording every time the UI changes.

Nothing sounds until somebody presses play — this page may be open in a waiting
room — and under `prefers-reduced-motion` the whole thing is replaced by a
storyboard: the same script as a readable document, with no playback.

<details>
<summary><b>More of the product</b> — the rest of the reviewer console, the safety page, accounts, and the full landing page</summary>

<br />

<table>
<tr>
<td width="50%"><img src="docs/screenshots/review-users.png" alt="The accounts page of the reviewer console, listing accounts with their roles and the moderation actions available" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/review-flags.png" alt="The flagged cases page of the reviewer console" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Accounts</b> — promote, demote and suspend, with the guards that stop a reviewer demoting the last one</td>
<td align="center"><b>Flagged cases</b> — what the public raised a concern about</td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/review-audit.png" alt="The audit trail page, explaining that entries cannot be edited or removed and that they outlive the account that created them" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/notifications.png" alt="The notifications page for a signed-in reporter" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Audit trail</b> — entries cannot be edited or removed, and outlive the account that created them</td>
<td align="center"><b>Notifications</b> — a status change, a possible match, a decision</td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/safety.png" alt="The safety and privacy page, explaining what a stranger sees on a case and what is never published, with each section naming the source file that enforces it" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/how-it-works.png" alt="The how it works page, describing the report, review, match and reunite steps" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Safety &amp; privacy</b> — behaviours, not intentions, each naming the file that enforces it</td>
<td align="center"><b>How it works</b> — the four steps, with a person involved at every one</td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/register.png" alt="The registration page" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/settings.png" alt="The settings page showing account details and preferences" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Register</b> — email and password, no third-party identity provider</td>
<td align="center"><b>Settings</b> — the account, and what it is allowed to do</td>
</tr>
</table>

**The report chooser**, which is the first fork in the product: two kinds of
report, filed independently by people who have never met.

<img src="docs/screenshots/report-chooser.png" alt="The report chooser, offering to report a missing person or to report someone found" width="100%" />

**The complete landing page**, top to bottom.

<img src="docs/screenshots/home-desktop.png" alt="The full Locora landing page, from the hero through two ways to help, how Locora works, the walkthrough, what happens after you file, the open cases strip, the trust section and the footer" width="100%" />

</details>

---

### Both themes, and neither is an inversion of the other

<table>
<tr>
<td width="50%"><img src="docs/screenshots/home-dark.png" alt="The Locora landing page rendered in the dark theme" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/cases-dark.png" alt="The public case feed rendered in the dark theme" width="100%" /></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/review-queue-dark.png" alt="The review queue rendered in the dark theme" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/dashboard-dark.png" alt="The reporter's dashboard rendered in the dark theme" width="100%" /></td>
</tr>
</table>

The status colours carry meaning here — **missing** and **found** are the two
things a reader has to tell apart at a glance in a grid of faces. Flipping a
light palette's lightness channel is what turns those into two similar browns.
The theme is applied by a blocking script before first paint, so a returning
visitor never sees a white flash on the way to a dark page.

### Built for a phone, not shrunk onto one

A report is plausibly filed on a phone, in a hurry, by somebody who is not
calm. That is not a narrow desktop; it is the likeliest way this product is
used at all, so it is tested rather than assumed — a second Playwright project
runs the whole suite on a Pixel 7 viewport with touch emulation.

<table>
<tr>
<td width="33%"><img src="docs/screenshots/home-mobile.png" alt="The Locora landing page on a phone" width="100%" /></td>
<td width="33%"><img src="docs/screenshots/report-missing-mobile.png" alt="The missing-person report form on a phone" width="100%" /></td>
<td width="33%"><img src="docs/screenshots/review-queue-mobile.png" alt="The reviewer console's queue on a phone" width="100%" /></td>
</tr>
</table>

---

## What you can do

<table>
<tr>
<td width="33%" valign="top">

**Report someone missing**

A name is the only required field. Age, height, what they were wearing, where
and when they were last seen, photographs and a police reference all help —
and anything you are unsure of can be left blank rather than guessed at.

</td>
<td width="33%" valign="top">

**Report someone found**

The mirror image, and deliberately not symmetrical. An estimated age *range*
rather than an age, because a guess presented as a fact is worse than a range.
A photograph is optional, and where the person is now is never published.

</td>
<td width="33%" valign="top">

**Be told what happened**

A decline carries a written reason you can read, and is not a dead end — you
can correct what was wrong and file again. A status change, a possible match
or a decision reaches you in the app, and by email if that is configured.

</td>
</tr>
<tr>
<td width="33%" valign="top">

**Browse a feed of real cases**

Published cases, searchable by name or description and filterable by city.
The most valuable thing that can happen on this platform is a stranger
scrolling past a face they recognise, so the feed is on the landing page.

</td>
<td width="33%" valign="top">

**Say you recognise someone**

A button on every case, which tells you to contact the police first and then
routes what you know to the reviewer handling that case. It never hands you
the family's telephone number.

</td>
<td width="33%" valign="top">

**Raise a concern**

Anything published can be flagged, and flags land in their own queue in the
reviewer console rather than in an inbox nobody reads.

</td>
</tr>
<tr>
<td width="33%" valign="top">

**Review, as a reviewer**

Read the full report including its private fields, then publish it or decline
it with a reason. Search, filter and sort the queue — oldest first is the
default, because the alternative is a report that waits forever.

</td>
<td width="33%" valign="top">

**Link two reports, carefully**

Ranked candidates with their reasons, a note kept on the match record, and two
notifications that say *possibility*, not *fact*. Confirming closes both
cases; ruling it out puts both back on the feed.

</td>
<td width="33%" valign="top">

**Moderate, and be accountable for it**

Promote, demote and suspend accounts — with guards against demoting the last
reviewer or suspending yourself. Every action is written to an audit trail
that cannot be edited and outlives the account that made it.

</td>
</tr>
</table>

---

## How it works

Two kinds of report, filed independently by people who have never met. A review
process between them, and a person at every junction.

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
implementation detail — a false match here is not a bad recommendation, it is a
family being told something untrue about a missing relative.

The two report types are not mirror images of each other, and the asymmetry is
the design:

|                    | **Missing person**                                    | **Found person**                                                   |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| **Who files it**   | Somebody who knows exactly who the person is           | Somebody who has found a person unable to say who they are          |
| **Age**            | An age — the reporter knows it                        | An age *range* — an estimate, presented as one                      |
| **Photograph**     | Usually present, and the point of the case            | Optional by design; publishing one is sometimes not the safe choice |
| **Location**       | Where they were last seen, published approximately    | Where they were found — and **never** where they are now            |

---

## The part that matters

Locora holds some of the most sensitive information a person can hand over: a
child's photograph, a family's telephone number, and the address of somebody
who may have fled to get there. The `/safety` page describes what happens to
each of them — and every section on it names the source file that enforces the
claim, because a privacy policy that asks to be believed is worth nothing.

| Rule                                              | How it is enforced                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Contact details never reach a stranger**        | Public queries do not *select* those columns. They are not fetched and then filtered, because filtering is a step somebody can forget to extend.              |
| **Every projection names each field it returns**  | Copying the row and deleting the sensitive keys would be shorter, and is exactly the bug: the next column added would be published by default.                |
| **An unreviewed or declined case is unreachable** | And refusal is a `404`, never a `403` — a `403` confirms the case exists, which is the fact being protected.                                                   |
| **A ban takes effect on the next request**        | The user row is loaded per request rather than the access token's claims being trusted, so a suspension does not wait for a token to expire.                  |
| **A replayed refresh token revokes everything**   | Tokens rotate on every use. Presenting a used one signs out every session on the account rather than quietly issuing a new pair.                              |
| **Uploads are what they claim to be**             | Validated by magic number, and the *sniffed* type — never the declared one — is what gets stored and re-served.                                               |
| **Logs cannot leak a case**                       | Redaction runs by key pattern before serialisation, and ESLint blocks bare `console.log` outside scripts.                                                     |
| **Reviewer actions are auditable**                | Every one is written to an append-only trail, and the audit metadata refuses personal data — otherwise the log becomes a second, unredacted copy of the case. |

These are asserted, not asserted-about. Redaction is tested against the
**serialised output** rather than the projection's intent, so a field that
starts leaking is caught. The end-to-end suite checks that private fields are
absent from the **rendered HTML**, which is a different question from being
absent from a projection. And the rate limiter is tested only against real
PostgreSQL, because the property that matters is that the counter is *shared* —
a per-process one passes every in-memory test while being wrong in production.

Locora holds no security certification and no compliance audit, and has no
partnership with any police force, government body or charity. If you see such
a claim attached to this product, it did not come from here.

### Where assisted matching would go, and what it may never do

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

The constraint that must not be relaxed: **nothing resolves a case without a
person.** Any future scorer should be presented the way today's one is — as
reasons a reviewer can weigh, not a number they can defer to.

---

## Built with

<div align="center">

<h4>Framework and language</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/nextdotjs/000000/ffffff" width="42" height="42" alt="Next.js" /><br /><sub><b>Next.js</b><br />16.3 App Router</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/react/61DAFB/61DAFB" width="42" height="42" alt="React" /><br /><sub><b>React</b><br />19.2</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/typescript/3178C6/3178C6" width="42" height="42" alt="TypeScript" /><br /><sub><b>TypeScript</b><br />5.9 strict</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/nodedotjs/5FA04E/5FA04E" width="42" height="42" alt="Node.js" /><br /><sub><b>Node.js</b><br />22+</sub></td>
</tr>
</table>

<h4>Interface</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/tailwindcss/06B6D4/06B6D4" width="42" height="42" alt="Tailwind CSS" /><br /><sub><b>Tailwind CSS</b><br />4.3</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/lucide/F56565/F56565" width="42" height="42" alt="Lucide" /><br /><sub><b>Lucide</b><br />icons</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/leaflet/199900/4ec14e" width="42" height="42" alt="Leaflet" /><br /><sub><b>Leaflet</b><br />approximate maps</sub></td>
</tr>
</table>

<h4>Data and storage</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/postgresql/4169E1/7d9bff" width="42" height="42" alt="PostgreSQL" /><br /><sub><b>PostgreSQL</b><br />16</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/drizzle/C5F74F/C5F74F" width="42" height="42" alt="Drizzle ORM" /><br /><sub><b>Drizzle ORM</b><br />0.45</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/neon/00E599/00E599" width="42" height="42" alt="Neon" /><br /><sub><b>Neon</b><br />hosted Postgres</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/vercel/000000/ffffff" width="42" height="42" alt="Vercel Blob" /><br /><sub><b>Vercel Blob</b><br />photographs</sub></td>
</tr>
</table>

<h4>Validation and auth</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/zod/3E67B1/7fa3e0" width="42" height="42" alt="Zod" /><br /><sub><b>Zod</b><br />4.5</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/jsonwebtokens/000000/ffffff" width="42" height="42" alt="JSON Web Tokens" /><br /><sub><b>JWT</b><br />via jose</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/nodedotjs/5FA04E/5FA04E" width="42" height="42" alt="Node.js crypto" /><br /><sub><b>scrypt</b><br />64 MiB per hash</sub></td>
</tr>
</table>

<h4>Testing and delivery</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/vitest/6E9F18/9BD62F" width="42" height="42" alt="Vitest" /><br /><sub><b>Vitest</b><br />5.0</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/eslint/4B32C3/8b7ae8" width="42" height="42" alt="ESLint" /><br /><sub><b>ESLint</b><br />9</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/docker/2496ED/2496ED" width="42" height="42" alt="Docker" /><br /><sub><b>Docker</b><br />local Postgres</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/vercel/000000/ffffff" width="42" height="42" alt="Vercel" /><br /><sub><b>Vercel</b><br />deployment</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/github/181717/ffffff" width="42" height="42" alt="GitHub" /><br /><sub><b>GitHub</b><br />Actions CI</sub></td>
</tr>
</table>

</div>

Also carrying real weight, without a brand mark of their own: **Playwright**
drives the end-to-end suite against a production build, on a desktop and a
Pixel 7 viewport; **Testing Library** and **jsdom** cover the components;
**nodemailer** delivers over SMTP when a provider is configured and writes to
the console when one is not; **pg** connects and pools, chosen over Neon's HTTP
driver because that one cannot hold an interactive transaction and several
operations here need one; **tsx** runs the migration, seed, narration and
recording scripts; and **clsx** with **tailwind-merge** handles the styling
ergonomics.

A few of those choices are trades rather than defaults, and the reasoning is
written down where it can be argued with:

|                                                  |                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **scrypt, not Argon2id**                         | Argon2id is the stronger first recommendation. The Node packages for it are compiled addons, and on a serverless platform the failure mode of a native binary that stops matching its runtime image is that nobody can sign in.      |
| **A Postgres table, not Redis, for rate limits** | A per-process counter is silently multiplied by however many warm instances are running. Redis would be a second vendor, a second credential and a second thing to be down, to solve what one indexed table solves at this scale.     |
| **Server Components read the database directly** | Only writes go through route handlers. Giving reads an API route would make the application fetch over HTTP from itself — a second hop and a second invocation for data the renderer could already reach.                             |
| **`drizzle-kit push` is not wired up**           | It mutates a live schema with no reviewable artefact. Migrations are generated, read, committed, and are the only thing ever applied.                                                                                                |

The full breakdown, with the role each one plays, is in the
[technical documentation](TECHNICAL_README.md#architecture).
