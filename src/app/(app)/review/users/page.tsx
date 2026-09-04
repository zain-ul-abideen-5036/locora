import { Search, Users } from "lucide-react";

import { UserActions } from "@/components/review/user-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/feedback";
import { formatCount, formatDate, initials } from "@/lib/format";
import { listUsers } from "@/server/admin/users";
import { requireAdmin } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

/**
 * Accounts.
 *
 * ## Cards, not a table
 *
 * Each account carries four or five facts and a set of actions, and a table of
 * that on a phone is either a horizontal scroll or a column squeezed to
 * illegibility. Cards read the same at every width, and the actions sit with
 * the account they act on rather than in a menu at the end of a wide row.
 *
 * ## Search is a plain GET form
 *
 * Same reasoning as the public feed: the result is a shareable, bookmarkable
 * URL, and it works before JavaScript loads. There is no client-side state to
 * keep in sync with the address bar.
 */
export default async function ReviewUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const reviewer = await requireAdmin();
  const { q } = await searchParams;

  const { items, total } = await listUsers({ search: q, limit: 50 });

  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">Accounts</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          {formatCount(total)} {total === 1 ? "account" : "accounts"}. Suspending stops somebody
          filing; review access lets them read every private field on every case.
        </p>
      </div>

      <form method="get" className="mt-5 flex gap-2">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            aria-label="Search accounts by name or email"
            placeholder="Search by name or email"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState
            icon={<Users aria-hidden className="size-5" />}
            title={q ? "No accounts match" : "No accounts yet"}
            description={
              q
                ? "Try part of an email address instead."
                : "Accounts appear here as people register."
            }
          />
        ) : (
          <ul className="space-y-3">
            {items.map((user) => (
              <li key={user.id}>
                <Card className={user.isBanned ? "border-critical/30" : undefined}>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-start gap-3">
                      <span
                        aria-hidden
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold text-ink-muted"
                      >
                        {initials(user.fullName ?? user.email)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-ink">{user.fullName ?? "No name given"}</p>
                          {user.role === "admin" ? <Badge tone="primary">Reviewer</Badge> : null}
                          {user.isBanned ? <Badge tone="critical">Suspended</Badge> : null}
                          {!user.isEmailVerified ? (
                            <Badge tone="caution">Email not confirmed</Badge>
                          ) : null}
                          {user.id === reviewer.id ? <Badge>You</Badge> : null}
                        </div>

                        <p className="mt-0.5 truncate text-sm text-ink-muted">{user.email}</p>
                        <p className="mt-1 text-xs text-ink-subtle">
                          Joined {formatDate(user.createdAt)} ·{" "}
                          {user.reportCount === 0
                            ? "no reports"
                            : `${user.reportCount} ${user.reportCount === 1 ? "report" : "reports"}`}
                        </p>

                        {user.bannedReason ? (
                          <p className="mt-2 rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
                            <span className="font-medium text-ink">Suspended:</span>{" "}
                            {user.bannedReason}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="border-t border-line pt-3">
                      <UserActions
                        userId={user.id}
                        email={user.email}
                        isBanned={user.isBanned}
                        isAdmin={user.role === "admin"}
                        isSelf={user.id === reviewer.id}
                      />
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
