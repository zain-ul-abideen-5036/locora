import type { Metadata } from "next";
import Link from "next/link";

import { Callout } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "Safety & privacy",
  description:
    "What Locora publishes, what it withholds, who can see what, and how long information is kept.",
};

/**
 * Safety and privacy.
 *
 * Written as a description of what the software does, not as a policy document.
 * Every statement here corresponds to something in the code, and the file that
 * enforces it is named — so this page can be checked rather than believed.
 *
 * The limitations are stated as plainly as the protections. A privacy page that
 * only lists reassurances is a marketing page, and on a service handling
 * missing-person data that is worse than saying nothing.
 */

const SECTIONS: { title: string; paragraphs: string[]; enforcedBy?: string }[] = [
  {
    title: "What a stranger sees on a case",
    paragraphs: [
      "A published missing-person case shows the person's name, age, gender, height, a description of what they were wearing, any distinguishing features, the city and area they were last seen in, when they were last seen, and any photographs the reporter chose to add.",
      "It also shows the reporter's display name — the name on their account — so the case is not anonymous. It does not show their email address or telephone number.",
      "A published found-person case shows no name, because there is not one. It shows an estimated age range, gender, height, a description, the city and area, and when the person was found.",
    ],
  },
  {
    title: "What is never published",
    paragraphs: [
      "The contact name, telephone number and email address on a report are visible to the person who filed it and to Locora's reviewers. Nobody else receives them, in any form.",
      "For a found-person report, where the person is now — a hospital, a shelter, somebody's care — is also withheld. Published openly, that field would tell anyone, including whoever a person may have fled, exactly where to find a vulnerable adult or child. It is the most sensitive field Locora holds.",
      "A reviewer's note on a declined report is shown to the reporter and to reviewers, and to nobody else.",
      "The police reference number on a report is not published.",
    ],
    enforcedBy: "src/server/reports/visibility.ts",
  },
  {
    title: "How that is enforced",
    paragraphs: [
      "The server decides what to send, rather than the page deciding what to display. A public request for a case is answered with a response that has no contact fields in it at all — they are not sent and then hidden, they are never included.",
      "Every read of a case goes through one module that chooses between a public and an owner view. Each of those views names every field it returns, which is deliberately more work than the alternative: a projection that copied the row and deleted the sensitive keys would publish any column added to the database in future by default.",
      "Calling the API directly gets you the same response the page does. There is no version of a case endpoint that returns more because it was asked politely.",
    ],
    enforcedBy: "src/server/reports/visibility.ts",
  },
  {
    title: "Cases that are not public",
    paragraphs: [
      "A report awaiting review, being checked, or declined is visible only to the person who filed it and to reviewers. Its address is an unguessable identifier, but that is not what protects it — the server refuses the request.",
      "That matters most for a declined report. Some are declined because their content was abusive or was published without consent, and those have to stop being readable the moment that decision is made, including by anyone holding the link.",
      "A request for a case you may not see is answered as though it does not exist, rather than as though you lack permission. Saying \"you cannot see this\" would confirm the case is real.",
    ],
  },
  {
    title: "Resolved cases come down",
    paragraphs: [
      "When a case is closed, it leaves the public feed and its photographs are deleted from storage. Continuing to show somebody's face and last known location after they have been found serves nobody and harms the person it describes.",
      "The case page itself stays reachable for anyone holding the link, and stays fully visible to its reporter, so the record does not simply vanish for the family involved.",
    ],
  },
  {
    title: "Photographs",
    paragraphs: [
      "Photographs are stored outside the application, and their addresses are long random strings. An address is effectively unguessable, but it is not access-controlled: anyone given the address can load the image. That is a deliberate trade, and worth stating rather than glossing.",
      "The alternative would put an authenticated request in front of every thumbnail on the feed — and would make a public case feed, whose entire purpose is for a stranger to recognise a face, unable to show one. What the address is not is discoverable: it is never included in a response for a case you may not see, case pages are served with no-store, and search engines are told not to index them.",
      "On a found-person report, a photograph is optional by design. Publishing the face of somebody who has consented to nothing is a decision, and sometimes the right answer is not to.",
    ],
    enforcedBy: "src/server/storage/blob.ts",
  },
  {
    title: "Search engines",
    paragraphs: [
      "Published missing-person cases are indexable. That is intentional: for many families the single most likely route to recognition is somebody searching a name and finding the case, and withholding it from search would remove the largest source of help Locora can offer.",
      "Found-person cases are not indexed, and crawlers are told not to fetch them at all. There is no name to search for, so indexing offers almost nothing — while the subject is an unidentified person who has consented to nothing, and a search engine's cache outlives the case being taken down.",
      "Nothing behind a sign-in is indexed.",
    ],
    enforcedBy: "src/app/robots.ts",
  },
  {
    title: "Locations are approximate",
    paragraphs: [
      "Where a map is shown, it marks an area a few hundred metres across and cannot be zoomed closer than a neighbourhood. The useful information is \"near this park\"; the harmful version is an exact address.",
      "Coordinates are optional throughout. A report filed without them is not treated as incomplete.",
    ],
  },
  {
    title: "Accounts and sessions",
    paragraphs: [
      "Passwords are stored as scrypt hashes and are never recoverable, by Locora or by anybody else. A password reset sets a new one; it cannot reveal the old one.",
      "Session tokens are held in cookies that no JavaScript on the page can read, which means a script injected into the site could not steal a session. Sessions are short-lived and renewed silently, and renewing one invalidates the previous token — so a captured token is single-use, and presenting a used one signs the account out everywhere as a precaution.",
      "Changing or resetting a password signs out every other device.",
    ],
    enforcedBy: "src/server/auth/session.ts",
  },
  {
    title: "What reviewers can see, and what is recorded",
    paragraphs: [
      "A reviewer can read every field on every case, including contact details and where a found person is now. That access is what makes review and reunification possible, and it is the most privileged thing Locora grants.",
      "Every action a reviewer takes — publishing, declining, linking two cases, confirming or ruling out a match, suspending an account, changing somebody's role — is recorded against their account in an audit trail that cannot be edited or deleted from inside the product.",
      "Those records contain the action and what changed, never the personal data involved. An audit log that snapshotted whole records would be a second, unredacted copy of exactly the data it exists to protect.",
    ],
    enforcedBy: "src/server/admin/audit.ts",
  },
  {
    title: "What is logged",
    paragraphs: [
      "Server logs record what happened, not who it happened to. Names, email addresses, telephone numbers, addresses, coordinates, tokens and case notes are replaced before a log line is written.",
      "This is done by the logging module itself rather than left to each call site to remember, because a log line naming a missing child and their family's telephone number is a copy of the most sensitive record in the system, sitting outside every access control the application has.",
    ],
    enforcedBy: "src/server/observability/logger.ts",
  },
];

export default function SafetyPage() {
  return (
    <div className="container-page max-w-3xl py-12 sm:py-16">
      <header>
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink">
          Safety &amp; privacy
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          Locora asks for some of the most sensitive information a person can hand over. This page
          describes what it does with it — what is published, what is withheld, and where the
          limits are.
        </p>
      </header>

      <div className="mt-6">
        <Callout tone="info" title="These are behaviours, not intentions">
          Each section below describes something the software does, and names the file that does it.
          Locora is not asking to be trusted on this — it is telling you where to look.
        </Callout>
      </div>

      <div className="mt-12 space-y-12">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
              {section.title}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-base leading-relaxed text-ink-muted">
                {paragraph}
              </p>
            ))}
            {section.enforcedBy ? (
              <p className="mt-3 text-xs text-ink-subtle">
                Enforced by{" "}
                <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-ink-muted">
                  {section.enforcedBy}
                </code>
              </p>
            ) : null}
          </section>
        ))}
      </div>

      <div className="mt-14 space-y-5 border-t border-line pt-10">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Things Locora does not claim
        </h2>

        <Callout tone="warning" title="No certification, and no partnerships">
          Locora holds no security certification and no compliance audit, and has no partnership
          with any police force, government body or charity. If you see any such claim attached to
          this product, it did not come from here.
        </Callout>

        <Callout tone="warning" title="No guarantee of outcome">
          Publishing a case improves the chance that somebody recognises a face. It does not make
          that likely, and Locora will not suggest otherwise. The police remain the people with the
          ability to actually search for a person.
        </Callout>

        <Callout tone="info" title="Report anything that looks wrong">
          Every case page has a button for telling a reviewer that a report is fabricated,
          inappropriate, or should not have been published. Flags go to the same queue as
          everything else and are read by a person.
        </Callout>
      </div>

      <p className="mt-12 text-sm text-ink-muted">
        <Link
          href="/how-it-works"
          className="font-medium text-accent underline decoration-line-strong underline-offset-4 hover:decoration-accent"
        >
          Read how the review and matching process works
        </Link>
      </p>
    </div>
  );
}
