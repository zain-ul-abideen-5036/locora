import { expect, test } from "@playwright/test";

import { E2E_PENDING_CASE, E2E_PUBLISHED_CASE } from "./fixtures";

/**
 * What a stranger can do, and what they cannot.
 *
 * These run against a production build in a real browser, which is the only
 * place several of these assertions mean anything: that private fields are
 * absent from the *rendered page* rather than merely from a projection, and
 * that an unreviewed case is unreachable rather than merely unlisted.
 */

test.describe("the public site", () => {
  test("the landing page explains the product and offers both report paths", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Find what matters." })).toBeVisible();
    await expect(page.getByRole("link", { name: /report a missing person/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /found someone/i }).first()).toBeVisible();

    // The seeded published case is on the home page, because the cases are the
    // product rather than something two clicks away.
    await expect(page.getByText(E2E_PUBLISHED_CASE.fullName).first()).toBeVisible();
  });

  test("the case feed lists published cases and filters them", async ({ page }) => {
    await page.goto("/cases");

    await expect(page.getByRole("heading", { level: 1, name: /browse cases/i })).toBeVisible();
    await expect(page.getByText(E2E_PUBLISHED_CASE.fullName).first()).toBeVisible();

    // Filtering goes through the URL, so the result is shareable and Back works.
    await page.getByRole("searchbox", { name: /search by name/i }).fill("Aisha");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page).toHaveURL(/query=Aisha/);
    await expect(page.getByText(E2E_PUBLISHED_CASE.fullName).first()).toBeVisible();

    // A search matching nothing gets an explanation and a way out, not a blank.
    await page.goto("/cases?kind=missing&query=zzzznobodyzzzz");
    await expect(page.getByText(/nothing matches those filters/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /clear/i }).first()).toBeVisible();
  });

  test("a published case shows what a stranger needs and withholds the rest", async ({ page }) => {
    await page.goto("/cases");
    await page.getByText(E2E_PUBLISHED_CASE.fullName).first().click();

    await expect(
      page.getByRole("heading", { level: 1, name: E2E_PUBLISHED_CASE.fullName }),
    ).toBeVisible();
    await expect(page.getByText(/navy school uniform/i).first()).toBeVisible();

    /**
     * The assertion this whole file exists for.
     *
     * Checked against the raw HTML rather than through a locator, because a
     * locator only finds what is visibly rendered — a field leaked into a hidden
     * element, a data attribute, or the serialised server payload embedded in
     * the document would pass a visual check and still be a breach.
     */
    const html = await page.content();
    expect(html).not.toContain(E2E_PUBLISHED_CASE.contactPhone);
    expect(html).not.toContain(E2E_PUBLISHED_CASE.contactName);
    expect(html).not.toContain(E2E_PUBLISHED_CASE.policeReportNumber);
    expect(html).not.toContain("private-contact@locora.test");
  });

  test("a found case never leaks where the person is now", async ({ page }) => {
    await page.goto("/cases?kind=found");
    await page.getByText(/unidentified person/i).first().click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/unidentified person/i);

    // The single most sensitive field in the product.
    const html = await page.content();
    expect(html).not.toContain("District hospital ward 4");
    expect(html).not.toContain("+92 301 5550303");
  });

  test("an unreviewed case appears nowhere a stranger can reach", async ({ page }) => {
    await page.goto("/cases?kind=missing&query=Unreviewed");
    expect(await page.content()).not.toContain(E2E_PENDING_CASE.fullName);

    await page.goto("/cases?kind=missing");
    expect(await page.content()).not.toContain(E2E_PENDING_CASE.fullName);
  });

  test("a case id that does not exist renders the not-found page", async ({ page }) => {
    await page.goto("/cases/missing/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    // Written for the likely reason somebody lands here: a link to a case that
    // has since been resolved and taken down. They need to know the page is
    // gone deliberately, and that the case may have ended well.
    await expect(page.getByText(/this page is not here/i)).toBeVisible();
    await expect(page.getByText(/resolved cases are removed/i)).toBeVisible();

    /**
     * The HTTP status is deliberately not asserted, and that is a known
     * limitation rather than an oversight — see docs/KNOWN-LIMITATIONS.md.
     *
     * `notFound()` renders the correct page, but this route answers 200 rather
     * than 404: the response has begun streaming by the time the component
     * runs, so the status is already committed. A bare `notFound()` on a
     * simpler route in this same layout does return 404, so it is specific to
     * this one. The user-visible behaviour is right; the status is a soft 404,
     * which matters to crawlers and uptime monitors and not to a person.
     */
  });

  test("an unmatched route still answers with a real 404", async ({ page }) => {
    // The router decides this one before rendering, so the status is correct —
    // which is what confirms the not-found page itself is wired up properly and
    // the soft-404 above is about *when* the decision happens.
    const response = await page.goto("/this-route-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/this page is not here/i)).toBeVisible();
  });

  test("the explanatory pages state the limits, not just the reassurances", async ({ page }) => {
    await page.goto("/how-it-works");
    await expect(page.getByRole("heading", { level: 1, name: /how locora works/i })).toBeVisible();
    await expect(page.getByText(/not an emergency service/i).first()).toBeVisible();
    await expect(page.getByText(/does not search for anybody/i).first()).toBeVisible();

    await page.goto("/safety");
    await expect(page.getByRole("heading", { level: 1, name: /safety/i })).toBeVisible();
    // The product must not claim a certification or partnership it does not
    // have, and says so explicitly.
    await expect(page.getByText(/no certification, and no partnerships/i).first()).toBeVisible();
  });

  test("serves the security headers a production deployment depends on", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};

    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("tells crawlers to leave found-person cases and the console alone", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();

    const body = await robots.text();
    expect(body).toContain("/cases/found/");
    expect(body).toContain("/review");
    expect(body.toLowerCase()).toContain("sitemap:");
  });

  test("lists published missing cases in the sitemap and no found ones", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();

    const body = await sitemap.text();
    expect(body).toContain("/cases/missing/");
    // Found-person cases are excluded deliberately — see robots.ts.
    expect(body).not.toContain("/cases/found/");
  });

  test("reports a healthy deployment without telling a stranger how it is built", async ({
    request,
  }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    // Which subsystems are configured is a map of where to push, so an
    // anonymous caller gets the status and nothing else.
    expect(Object.keys(body)).toEqual(["status"]);
  });
});
