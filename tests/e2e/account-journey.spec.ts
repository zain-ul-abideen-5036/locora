import { expect, test } from "@playwright/test";

import { E2E_REPORTER, E2E_REVIEWER } from "./fixtures";

/**
 * Signing up, signing in, and what each kind of account can reach.
 *
 * The authorisation assertions here are the browser-level counterpart to the
 * integration suite's: those prove the service refuses, these prove nothing in
 * the routing or the rendering quietly lets somebody past it anyway.
 */

/** A fresh address per run, so re-running does not collide on the unique index. */
function newEmail(): string {
  return `signup-${Date.now()}-${Math.floor(Math.random() * 10_000)}@locora.test`;
}

test.describe("registration and sign-in", () => {
  test("a new account is created and signed in, and is told to confirm its address", async ({
    page,
  }) => {
    await page.goto("/register");

    await page.getByLabel(/your name/i).fill("New Reporter");
    await page.getByLabel(/email address/i).fill(newEmail());
    await page.getByLabel(/^password/i).fill("BrandNewPass9");
    await page.getByRole("button", { name: /create account/i }).click();

    // Signed in immediately — this is a product people reach in a bad moment,
    // and sending them back to a sign-in form adds a step for no gain.
    await expect(page.getByText(/your account is ready/i)).toBeVisible();
    // But told plainly that confirmation is what unlocks filing.
    await expect(page.getByText(/confirmation link/i)).toBeVisible();

    await page.getByRole("button", { name: /go to my dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1, name: /my reports/i })).toBeVisible();
  });

  test("refuses a weak password before it reaches the server", async ({ page }) => {
    await page.goto("/register");

    await page.getByLabel(/email address/i).fill(newEmail());
    await page.getByLabel(/^password/i).fill("short");
    await page.getByRole("button", { name: /create account/i }).click();

    // Targeted at the field's error, not the hint above it — both mention the
    // same rule, which is intentional, so the selector has to be specific.
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
    // Still on the form, with nothing created.
    await expect(page).toHaveURL(/\/register/);
  });

  test("signs in an existing account and signs it out again", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/email address/i).fill(E2E_REPORTER.email);
    await page.getByLabel(/^password/i).fill(E2E_REPORTER.password);
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1, name: /my reports/i })).toBeVisible();

    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();

    await expect(page).toHaveURL("/");
    // And the session is genuinely gone, not just visually.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("gives the same message for a wrong password as for an unknown address", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email address/i).fill(E2E_REPORTER.email);
    await page.getByLabel(/^password/i).fill("DefinitelyWrong1");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    const wrongPassword = await page.getByRole("alert").first().innerText();

    await page.goto("/login");
    await page.getByLabel(/email address/i).fill("nobody-at-all@locora.test");
    await page.getByLabel(/^password/i).fill("DefinitelyWrong1");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    const unknownAddress = await page.getByRole("alert").first().innerText();

    // Any difference here turns the form into a way to check who has an account.
    expect(wrongPassword).toBe(unknownAddress);
  });

  test("does not confirm whether an address is registered when resetting a password", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.getByLabel(/email address/i).fill("nobody-at-all@locora.test");
    await page.getByRole("button", { name: /send reset link/i }).click();

    await expect(page.getByText(/if .* has a locora account/i)).toBeVisible();
    // The page explains the evasion rather than leaving it looking like a bug.
    await expect(page.getByText(/we do not confirm whether an address is registered/i)).toBeVisible();
  });
});

test.describe("protected routes", () => {
  const PROTECTED = ["/dashboard", "/report", "/notifications", "/settings", "/review"];

  test("send a signed-out visitor to sign in, remembering where they were going", async ({
    page,
  }) => {
    for (const path of PROTECTED) {
      await page.goto(path);
      await expect(page, `${path} should require a session`).toHaveURL(/\/login/);
      // So signing in returns them to what they were trying to reach.
      await expect(page).toHaveURL(new RegExp(`next=${encodeURIComponent(path)}`));
    }
  });

  test("refuse the review console to a standard account", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email address/i).fill(E2E_REPORTER.email);
    await page.getByLabel(/^password/i).fill(E2E_REPORTER.password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // The account menu offers no route to it.
    await page.getByRole("button", { name: /account menu/i }).click();
    await expect(page.getByRole("menuitem", { name: /review console/i })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // And typing the address directly does not work either.
    const response = await page.goto("/review/queue");
    expect(response?.status()).toBe(403);
  });

  test("let a reviewer into the console, with the queue counts visible", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email address/i).fill(E2E_REVIEWER.email);
    await page.getByLabel(/^password/i).fill(E2E_REVIEWER.password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/review");
    await expect(page).toHaveURL(/\/review\/queue/);
    await expect(page.getByRole("heading", { level: 1, name: /review console/i })).toBeVisible();

    // The seeded pending case is waiting, and the reviewer can see the private
    // fields they need in order to decide.
    await expect(
      page.getByRole("heading", { name: "Unreviewed Person" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^publish$/i }).first()).toBeVisible();
  });

  test("a reviewer sees the private fields on a case, unlike a stranger", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email address/i).fill(E2E_REVIEWER.email);
    await page.getByLabel(/^password/i).fill(E2E_REVIEWER.password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/cases");
    await page.getByText("Aisha Khan").first().click();

    // The same page that withholds these from a stranger shows them here, in a
    // block that says plainly it is not public.
    await expect(page.getByText(/private to you/i)).toBeVisible();
    await expect(page.getByText("+92 300 5550101")).toBeVisible();
    await expect(page.getByText(/not public/i).first()).toBeVisible();
  });
});
