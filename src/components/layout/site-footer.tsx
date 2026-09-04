import Link from "next/link";

import { LocoraWordmark } from "@/components/brand/logo";

/**
 * The site footer.
 *
 * Deliberately short. A four-column footer of invented links — press, careers,
 * partners, integrations — is the clearest sign that a product is pretending to
 * be bigger than it is, and this one only lists pages that exist.
 *
 * There are no trust badges, no partner logos and no statistics here. Locora
 * has no verified figures to publish, and inventing "12,000 families helped"
 * for a service that reunites missing people would be the single worst thing
 * this interface could do.
 */

const SECTIONS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Report",
    links: [
      { href: "/report/missing", label: "Report a missing person" },
      { href: "/report/found", label: "Report someone found" },
      { href: "/cases", label: "Browse cases" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/how-it-works", label: "How Locora works" },
      { href: "/safety", label: "Safety & privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="container-page py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <LocoraWordmark size="md" showTagline />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-muted">
              Locora is a platform for reporting missing people, reporting people who have been
              found, and helping reunite them with their families. Every report is reviewed by a
              person before it appears publicly.
            </p>
          </div>

          {SECTIONS.map((section) => (
            <nav key={section.title} aria-label={section.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                {section.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-muted transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-subtle">
            © {new Date().getFullYear()} Locora. Find what matters.
          </p>
          {/* Said plainly, because somebody in an emergency should not be
              working out whether this is the right place to be. */}
          <p className="max-w-md text-xs leading-relaxed text-ink-subtle">
            Locora is not an emergency service. If someone is in immediate danger, contact your
            local emergency number and the police first.
          </p>
        </div>
      </div>
    </footer>
  );
}
