/**
 * Email delivery.
 *
 * Two backends behind one function. `console` (the default) writes the message
 * to the server log, so local development needs no SMTP account and the
 * confirmation link is right there in the terminal. `smtp` sends for real —
 * SendGrid, SES, Postmark, Mailgun and a plain relay all speak the same
 * protocol, so no provider-specific SDK is needed.
 *
 * ## Sending never fails a request
 *
 * Every call goes through `send`, which catches and logs. This is load-bearing:
 * if registration awaited delivery and threw on failure, an SMTP hiccup would
 * turn "your account was created, check your email" into a 500 and a user who
 * cannot tell whether they now have an account. The account is created; the
 * email is best-effort; the UI says an email is on its way and offers to resend.
 *
 * ## Serverless and connection reuse
 *
 * The transport is created once per warm instance, not once per message. A
 * fresh SMTP connection costs a TCP handshake plus TLS plus AUTH before a byte
 * of the message moves, which on a short-lived function is most of the total
 * time spent.
 */
import type { Transporter } from "nodemailer";

import { env } from "@/server/config/env";
import { logger } from "@/server/observability/logger";

import type { EmailContent } from "./templates";

let transport: Transporter | undefined;
let transportFailed = false;

async function getTransport(): Promise<Transporter | undefined> {
  if (transport) return transport;
  // Nodemailer is imported lazily so a console-backend deployment never loads
  // it, and a cold start on the console backend pays nothing for it.
  if (transportFailed) return undefined;

  try {
    const nodemailer = await import("nodemailer");
    transport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      // `secure` means implicit TLS, which is port 465. Port 587 starts plain
      // and upgrades with STARTTLS, which nodemailer does automatically when
      // secure is false. Setting this to true on 587 produces a connection that
      // hangs rather than an error that explains itself.
      secure: env.smtp.secure,
      auth:
        env.smtp.user && env.smtp.password
          ? { user: env.smtp.user, pass: env.smtp.password }
          : undefined,
      // Bounded so a stalled provider cannot hold a serverless invocation open
      // until the platform kills it.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      pool: true,
      maxConnections: 2,
    });
    return transport;
  } catch (error) {
    transportFailed = true;
    logger.error("Could not create the SMTP transport", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Sends a message. Resolves either way — never throws.
 *
 * Returns whether it was actually handed off, which the resend endpoint uses to
 * decide what to tell the user.
 */
export async function send(to: string, content: EmailContent): Promise<boolean> {
  if (env.emailBackend === "console" || !env.smtp.host) {
    // The whole body would bury the useful part, and the logger redacts the
    // recipient anyway. The link is what a developer actually needs, and the
    // text alternative is where it is plainly visible.
    logger.info("Email (console backend — not sent)", {
      subject: content.subject,
      preview: content.text.slice(0, 400),
    });
    return true;
  }

  const smtp = await getTransport();
  if (!smtp) return false;

  try {
    await smtp.sendMail({
      from: env.smtp.from,
      to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      headers: {
        // Marks this as an automated message so well-behaved mail systems do
        // not send a vacation auto-reply back to a no-reply address.
        "Auto-Submitted": "auto-generated",
      },
    });
    logger.info("Email sent", { subject: content.subject });
    return true;
  } catch (error) {
    logger.error("Email delivery failed", {
      subject: content.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Whether email is configured to actually leave the building.
 *
 * Surfaced by the health endpoint, so an operator can see at a glance that a
 * deployment is silently running on the console backend — which otherwise looks
 * exactly like working email until somebody needs a password reset.
 */
export function emailDeliveryConfigured(): boolean {
  return env.emailBackend === "smtp" && Boolean(env.smtp.host);
}
