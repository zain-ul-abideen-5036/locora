/**
 * Creating the first administrator.
 *
 * Somebody has to be able to review the first report, and there is no
 * administrator to grant that to yet. The alternatives are all worse than this:
 * a self-service "make me an admin" route is an open privilege escalation; a
 * seeded default account is a published credential; and opening a SQL console
 * against production is a step that does not belong in a routine deploy.
 *
 * So: whoever controls the deployment's environment sets `INITIAL_ADMIN_EMAIL`,
 * and exactly that address is promoted. It cannot be influenced by anything a
 * visitor can reach.
 *
 * This runs from two places, because either order has to work:
 *   - the migration script, for the case where the account already exists when
 *     the variable is first set;
 *   - registration, for the case where the variable is set before that person
 *     has signed up.
 *
 * The account is also marked email-verified, so an operator cannot be locked
 * out of their own instance by an email backend that is not delivering yet.
 * Once that account can promote others from the console, the variable can be
 * removed — this is a bootstrap, not an ongoing grant.
 */
import { eq, sql } from "drizzle-orm";

import { type Database } from "@/db/client";
import { users } from "@/db/schema";
import { env } from "@/server/config/env";

export type BootstrapOutcome =
  | "not configured"
  | "account does not exist yet"
  | "already an administrator"
  | "promoted";

export async function reconcileBootstrapAdmin(db: Database): Promise<BootstrapOutcome> {
  const configured = env.initialAdminEmail;
  if (!configured) return "not configured";

  const [existing] = await db
    .select({ id: users.id, role: users.role, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    // Matched case-insensitively, the same way a login is, so a difference in
    // capitalisation between the environment variable and the typed address
    // does not silently fail to promote anybody.
    .where(sql`lower(${users.email}) = ${configured}`)
    .limit(1);

  if (!existing) return "account does not exist yet";

  if (existing.role === "admin" && existing.emailVerifiedAt) return "already an administrator";

  await db
    .update(users)
    .set({
      role: "admin",
      emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing.id));

  return "promoted";
}

/** True when this address is the configured bootstrap administrator. */
export function isBootstrapAdminEmail(email: string): boolean {
  return env.initialAdminEmail !== undefined && email.trim().toLowerCase() === env.initialAdminEmail;
}
