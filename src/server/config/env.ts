/**
 * Application configuration.
 *
 * Two rules make this file worth having rather than reading `process.env`
 * inline at each call site:
 *
 * 1. A blank string counts as unset. Reading a variable with `?? fallback` is
 *    wrong for configuration, and wrong in a way that only appears on a
 *    deployment: `??` falls back on null and undefined but not on the empty
 *    string, and the empty string is exactly what a hosting dashboard stores
 *    when someone adds a variable before they know its value. The fallback is
 *    then skipped and the blank used as though it were real.
 *
 * 2. Production is held to a higher standard than "parses". `assertProductionConfig`
 *    refuses a configuration that is merely valid but unsafe — a missing signing
 *    key, SMTP selected with no host. On a platform holding missing-person case
 *    data, a loud failure at deploy time is much better than a silent
 *    misconfiguration discovered by a user.
 */

/** Treats blank and whitespace-only as absent, which is what "unset" means to a person. */
export function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  const raw = nonEmpty(value)?.toLowerCase();
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function int(value: string | undefined, fallback: number): number {
  const raw = nonEmpty(value);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Vercel supplies bare hostnames with no scheme. */
function withScheme(host: string | undefined): string | undefined {
  if (!host) return undefined;
  return /^https?:\/\//.test(host) ? host : `https://${host}`;
}

export type EmailBackend = "console" | "smtp";

/**
 * The site's own public origin, used for links in emails and for social
 * metadata.
 *
 * Falls through an explicit override, then the two hostnames Vercel provides,
 * then localhost. Because the Vercel values are always present on a deployment,
 * NEXT_PUBLIC_SITE_URL does not need to be set at all — and a preview
 * deployment gets its own correct URL rather than the production one.
 *
 * Never throws: a typo in one variable should not take a build down over
 * social-preview metadata.
 */
export function resolveSiteUrl(): URL {
  const candidates = [
    nonEmpty(process.env.NEXT_PUBLIC_SITE_URL),
    withScheme(nonEmpty(process.env.VERCEL_PROJECT_PRODUCTION_URL)),
    withScheme(nonEmpty(process.env.VERCEL_URL)),
    "http://localhost:3000",
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(candidate);
    } catch {
      // Try the next candidate rather than failing the render.
    }
  }
  return new URL("http://localhost:3000");
}

export interface Env {
  readonly nodeEnv: string;
  readonly isProduction: boolean;
  readonly isTest: boolean;

  readonly databaseUrl: string | undefined;
  readonly authSecret: string | undefined;
  readonly initialAdminEmail: string | undefined;
  readonly blobToken: string | undefined;

  readonly siteUrl: string;

  readonly emailBackend: EmailBackend;
  readonly smtp: {
    readonly host: string | undefined;
    readonly port: number;
    readonly user: string | undefined;
    readonly password: string | undefined;
    readonly secure: boolean;
    readonly from: string;
  };

  readonly requireVerifiedEmailToReport: boolean;

  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly emailVerificationTtlSeconds: number;
  readonly passwordResetTtlSeconds: number;

  readonly cookieSecure: boolean;
}

function build(): Env {
  const nodeEnv = nonEmpty(process.env.NODE_ENV) ?? "development";
  // VERCEL_ENV distinguishes a preview deployment from production; NODE_ENV is
  // "production" for both, so it cannot make that distinction on its own.
  const vercelEnv = nonEmpty(process.env.VERCEL_ENV);
  const isProduction = vercelEnv === "production" || (!vercelEnv && nodeEnv === "production");
  const siteUrl = resolveSiteUrl();

  return {
    nodeEnv,
    isProduction,
    isTest: nodeEnv === "test",

    databaseUrl: nonEmpty(process.env.DATABASE_URL),
    authSecret: nonEmpty(process.env.AUTH_SECRET),
    initialAdminEmail: nonEmpty(process.env.INITIAL_ADMIN_EMAIL)?.toLowerCase(),
    blobToken: nonEmpty(process.env.BLOB_READ_WRITE_TOKEN),

    siteUrl: siteUrl.origin,

    emailBackend: nonEmpty(process.env.EMAIL_BACKEND) === "smtp" ? "smtp" : "console",
    smtp: {
      host: nonEmpty(process.env.SMTP_HOST),
      port: int(process.env.SMTP_PORT, 587),
      user: nonEmpty(process.env.SMTP_USER),
      password: nonEmpty(process.env.SMTP_PASSWORD),
      secure: bool(process.env.SMTP_SECURE, false),
      from: nonEmpty(process.env.EMAIL_FROM) ?? "Locora <no-reply@locora.app>",
    },

    requireVerifiedEmailToReport: bool(process.env.REQUIRE_VERIFIED_EMAIL_TO_REPORT, true),

    // 15 minutes. Short enough that a stolen access token has little value,
    // long enough that the silent-refresh path is not on the hot path of every
    // interaction. See src/server/auth/session.ts.
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
    emailVerificationTtlSeconds: 24 * 60 * 60,
    // Deliberately much shorter than verification: a live reset link is a
    // standing account takeover if the mailbox is later compromised.
    passwordResetTtlSeconds: 60 * 60,

    // Secure cookies cannot be set over plain HTTP, which is what local
    // development uses, so this follows the environment rather than being fixed.
    cookieSecure: isProduction,
  };
}

export const env: Env = build();

/**
 * Fails fast on a production configuration that would be unsafe or broken.
 *
 * Called from the migration script (so a bad configuration stops the deploy)
 * and from the health endpoint (so an already-running deployment reports it).
 */
export function assertProductionConfig(target: Env = env): void {
  if (!target.isProduction) return;

  const problems: string[] = [];

  if (!target.databaseUrl) {
    problems.push("DATABASE_URL is not set.");
  }

  if (!target.authSecret) {
    problems.push(
      "AUTH_SECRET is not set. Generate one with `openssl rand -hex 32`. " +
        "Without it no session token can be signed.",
    );
  } else if (target.authSecret.length < 32) {
    problems.push(
      `AUTH_SECRET is only ${target.authSecret.length} characters. ` +
        "Use at least 32 (`openssl rand -hex 32` gives 64).",
    );
  }

  if (!target.blobToken) {
    problems.push(
      "BLOB_READ_WRITE_TOKEN is not set, so photo upload will fail. " +
        "Link a Vercel Blob store to the project and Vercel will inject it.",
    );
  }

  if (target.emailBackend === "smtp" && !target.smtp.host) {
    problems.push("EMAIL_BACKEND=smtp but SMTP_HOST is not set.");
  }

  if (problems.length > 0) {
    throw new Error(
      `Locora refused to start: ${problems.length} configuration problem(s).\n` +
        problems.map((problem) => `  - ${problem}`).join("\n"),
    );
  }
}
