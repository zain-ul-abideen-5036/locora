/**
 * Credential validation.
 *
 * The password policy here is a floor, not a security strategy. Rate limiting
 * (src/server/security/rate-limit.ts) and a slow KDF
 * (src/server/auth/password.ts) are what actually make guessing expensive; this
 * only rules out the handful of choices that dominate every credential-stuffing
 * list.
 */
import { z } from "zod";

import { optionalText, phoneSchema } from "./common";

/**
 * Lowercased and trimmed before storage or lookup.
 *
 * Without this, "Ada@Example.com" and "ada@example.com" become two separate
 * accounts. On this platform that is not a cosmetic problem: a family member
 * who capitalises their address differently on a second visit signs in to an
 * empty dashboard and cannot find the report they filed. The local part is
 * technically case-sensitive per RFC 5321, but no mainstream provider treats it
 * that way, so normalising is both safe and what people expect.
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email address is required.")
  .max(254, "That email address is too long.")
  .email("Please enter a valid email address.")
  .transform((value) => value.toLowerCase());

const MIN_PASSWORD_LENGTH = 10;

/**
 * Passwords that a length-and-character-class rule happily accepts and an
 * attacker tries in the first few thousand guesses. Deliberately short: this is
 * a last line of defence, not a substitute for a breach-corpus check, which
 * would need a network call on the registration path.
 */
const COMMON_PASSWORDS = new Set([
  "password1",
  "password12",
  "password123",
  "password1234",
  "passw0rd1",
  "p@ssword1",
  "qwerty1234",
  "qwertyuiop1",
  "1qaz2wsx3edc",
  "letmein123",
  "welcome123",
  "welcome1234",
  "admin12345",
  "administrator1",
  "iloveyou123",
  "abcd1234",
  "changeme123",
  "monkey1234",
  "football123",
  "sunshine123",
  "trustno1234",
  "locora1234",
]);

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  // Hashing is memory-hard and priced per byte of input, so an unbounded
  // password is a way to make the server do unbounded work on an unauthenticated
  // endpoint.
  .max(200, "That password is longer than 200 characters.")
  .refine((value) => /[a-z]/.test(value), "Include a lowercase letter.")
  .refine((value) => /[A-Z]/.test(value), "Include an uppercase letter.")
  .refine((value) => /\d/.test(value), "Include a number.")
  .refine(
    (value) => !COMMON_PASSWORDS.has(value.toLowerCase()),
    "That password is too common. Please choose another.",
  );

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: optionalText(120),
  phone: phoneSchema.optional().nullable().default(null),
});

export const loginSchema = z.object({
  email: emailSchema,
  // No policy check on sign-in. Applying the registration rules here would
  // lock out anyone whose password predates a policy change, and would also
  // reveal the policy to someone probing with guesses.
  password: z.string().min(1, "Password is required."),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "This reset link is missing its token."),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "This confirmation link is missing its token."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "Your new password must be different from the current one.",
    path: ["newPassword"],
  });

export const updateProfileSchema = z.object({
  fullName: optionalText(120),
  phone: phoneSchema.optional().nullable().default(null),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * A rough strength signal for the registration form's meter.
 *
 * Presentational only, and never consulted server-side — `passwordSchema` is
 * the rule. A meter that blocks submission on a heuristic is a meter that
 * eventually rejects a genuinely strong password for failing to look strong.
 */
export function scorePassword(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: "" };

  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) score = 0;

  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const labels = ["Too weak", "Weak", "Fair", "Strong", "Very strong"] as const;
  return { score: clamped, label: labels[clamped] };
}
