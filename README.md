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
