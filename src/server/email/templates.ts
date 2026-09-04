/**
 * Transactional email bodies.
 *
 * Written as inline-styled tables rather than with a modern layout, because
 * email clients are not browsers: Outlook renders with Word's engine, Gmail
 * strips `<style>` blocks in some contexts, and flexbox is unreliable across
 * both. Every message also carries a plain-text alternative — some clients show
 * it, some people prefer it, and a message with no text part scores worse with
 * spam filters.
 *
 * No tracking pixels and no external images. A tracking pixel on a message
 * telling somebody their missing relative may have been found is not a thing
 * this product will do, and a remote image is a load-time leak of when and
 * where the message was opened.
 */
import { escapeHtml } from "@/lib/format";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const BRAND = "#1b3a6b";
const INK = "#16202e";
const MUTED = "#5b6979";
const BORDER = "#e3e8ef";
const CANVAS = "#f5f7fa";

/**
 * Wraps a message body in the shared shell.
 *
 * `preheader` is the line a client shows next to the subject in the inbox list.
 * Left unset, clients fall back to whatever text comes first — usually a
 * navigation label or the word "Locora" repeated, which wastes the one piece of
 * context a recipient sees before deciding to open.
 */
function layout(options: { preheader: string; heading: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 0 32px;">
              <span style="font-size:17px;font-weight:700;letter-spacing:-0.01em;color:${BRAND};">Locora</span>
              <span style="font-size:13px;color:${MUTED};padding-left:8px;">Find what matters.</span>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 32px 32px;">
              <h1 style="margin:0 0 12px 0;font-size:21px;line-height:1.3;font-weight:650;color:${INK};">${escapeHtml(options.heading)}</h1>
              ${options.body}
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px;">
          <tr>
            <td style="padding:20px 32px;text-align:center;font-size:12px;line-height:1.6;color:${MUTED};">
              You received this because an account on Locora uses this address.<br>
              Locora never asks for your password by email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${INK};">${text}</p>`;
}

function muted(text: string): string {
  return `<p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">${text}</p>`;
}

/**
 * A button, plus the same URL as text underneath.
 *
 * The visible URL is not redundant. Some clients strip or rewrite links, some
 * recipients read in plain text, and — most importantly — somebody being asked
 * to click a link about a missing relative deserves to see where it goes before
 * they do.
 */
function button(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td style="background:${BRAND};border-radius:8px;">
        <a href="${safeHref}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 14px 0;font-size:12px;line-height:1.5;color:${MUTED};word-break:break-all;">${safeHref}</p>`;
}

function hoursOrMinutes(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.round(seconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function verificationEmail(link: string, ttlSeconds: number): EmailContent {
  const window = hoursOrMinutes(ttlSeconds);
  return {
    subject: "Confirm your email address",
    html: layout({
      preheader: `Confirm your address to finish setting up your Locora account. The link expires in ${window}.`,
      heading: "Confirm your email address",
      body: [
        paragraph("Confirming your address lets you file reports and receive updates on your cases."),
        button(link, "Confirm my email"),
        muted(
          `This link expires in ${window} and can be used once. ` +
            "If you did not create a Locora account, you can safely ignore this message.",
        ),
      ].join("\n"),
    }),
    text: [
      "Confirm your email address",
      "",
      "Confirming your address lets you file reports and receive updates on your cases.",
      "",
      link,
      "",
      `This link expires in ${window} and can be used once.`,
      "If you did not create a Locora account, you can safely ignore this message.",
    ].join("\n"),
  };
}

export function passwordResetEmail(link: string, ttlSeconds: number): EmailContent {
  const window = hoursOrMinutes(ttlSeconds);
  return {
    subject: "Reset your Locora password",
    html: layout({
      preheader: `Choose a new password. The link expires in ${window}.`,
      heading: "Reset your password",
      body: [
        paragraph("Use the link below to choose a new password."),
        button(link, "Choose a new password"),
        muted(
          `This link expires in ${window} and can be used once. ` +
            "Setting a new password signs you out everywhere else. " +
            "If you did not ask for this, no action is needed — your password has not changed.",
        ),
      ].join("\n"),
    }),
    text: [
      "Reset your password",
      "",
      "Use the link below to choose a new password.",
      "",
      link,
      "",
      `This link expires in ${window} and can be used once.`,
      "Setting a new password signs you out everywhere else.",
      "If you did not ask for this, no action is needed — your password has not changed.",
    ].join("\n"),
  };
}

/**
 * A possible match on one of the recipient's reports.
 *
 * Says as little as possible about the other report. This message travels
 * through mail servers and sits in an inbox, and the person receiving it may be
 * about to learn something devastating — so it carries no name, no photograph
 * and no location, only the fact that there is something to look at and a link
 * to the case where the details are behind an authenticated page.
 */
export function possibleMatchEmail(link: string): EmailContent {
  return {
    subject: "A possible match on your Locora report",
    html: layout({
      preheader: "A reviewer has linked your report to another. Sign in to see the details.",
      heading: "A possible match on your report",
      body: [
        paragraph(
          "A Locora reviewer has identified another report that may relate to yours. " +
            "Nothing is confirmed yet — a person reviews every link before it is treated as a match.",
        ),
        button(link, "Review the details"),
        muted(
          "You will need to sign in. We keep case details out of email so they " +
            "stay behind your account.",
        ),
      ].join("\n"),
    }),
    text: [
      "A possible match on your report",
      "",
      "A Locora reviewer has identified another report that may relate to yours.",
      "Nothing is confirmed yet — a person reviews every link before it is treated as a match.",
      "",
      link,
      "",
      "You will need to sign in. We keep case details out of email so they stay behind your account.",
    ].join("\n"),
  };
}

/** Notice that a password was changed, sent to the address on the account. */
export function passwordChangedEmail(): EmailContent {
  return {
    subject: "Your Locora password was changed",
    html: layout({
      preheader: "If this was not you, reset your password immediately.",
      heading: "Your password was changed",
      body: [
        paragraph("The password on your Locora account was just changed, and every other session was signed out."),
        muted(
          "If you did not do this, use the “Forgot password” link on the sign-in " +
            "page to regain control of the account straight away.",
        ),
      ].join("\n"),
    }),
    text: [
      "Your password was changed",
      "",
      "The password on your Locora account was just changed, and every other session was signed out.",
      "",
      "If you did not do this, use the Forgot password link on the sign-in page to regain control of the account straight away.",
    ].join("\n"),
  };
}
