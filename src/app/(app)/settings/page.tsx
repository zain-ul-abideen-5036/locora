import type { Metadata } from "next";

import { ChangePasswordForm } from "@/components/account/change-password-form";
import { ProfileForm } from "@/components/account/profile-form";
import { ResendConfirmationButton } from "@/components/account/resend-confirmation-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Account settings.
 *
 * The email address is shown but not editable, and the page says why. Changing
 * it safely needs a confirm-the-new-address-before-switching flow, and a
 * half-built version that switches first and confirms later hands the account to
 * whoever typed the new address. Until that exists properly, saying so is more
 * honest than offering a field that quietly does the wrong thing.
 */
export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="container-page max-w-2xl py-10 sm:py-14">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Settings
        </h1>
        <p className="mt-2 text-base text-ink-muted">Your account details and password.</p>
      </header>

      <div className="mt-8 space-y-6">
        <Card>
          <CardHeader
            title="Email address"
            description="Used to sign in, and to tell you about your cases."
            action={
              user.isEmailVerified ? (
                <Badge tone="positive">Confirmed</Badge>
              ) : (
                <Badge tone="caution">Not confirmed</Badge>
              )
            }
          />
          <CardBody className="space-y-3">
            <p className="font-medium text-ink">{user.email}</p>
            {user.isEmailVerified ? (
              <p className="text-sm leading-relaxed text-ink-muted">
                To change the address on your account, contact Locora. We do not switch it
                automatically, because doing that safely means confirming the new address before
                the old one stops working.
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-muted">
                  Confirm this address to file reports. The link expires after 24 hours.
                </p>
                <ResendConfirmationButton />
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Your details"
            description="Your name appears on notifications and is shown to reviewers. It is never shown to the public."
          />
          <CardBody>
            <ProfileForm initialFullName={user.fullName ?? ""} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Password"
            description="Changing it signs you out of every other device."
          />
          <CardBody>
            <ChangePasswordForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Account" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                  Joined
                </dt>
                <dd className="mt-1 text-base text-ink">{formatDate(user.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                  Access
                </dt>
                <dd className="mt-1 text-base text-ink">
                  {user.role === "admin" ? "Reviewer" : "Standard"}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
