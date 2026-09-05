import { expect, test } from "@playwright/test";

/**
 * Accessibility and layout, checked in a real browser.
 *
 * Deliberately not a full automated audit — those catch a narrow band of issues
 * and give a false sense of coverage for everything else. These assert the
 * specific properties this product committed to, each of which is a real
 * failure for a real person if it regresses.
 */

const PUBLIC_PAGES = ["/", "/cases", "/how-it-works", "/safety", "/login", "/register"];

test.describe("accessibility", () => {
  test("every page has exactly one h1, and it says what the page is", async ({ page }) => {
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      const headings = page.getByRole("heading", { level: 1 });
      // More than one makes the document outline meaningless to anybody
      // navigating by heading; none leaves them with no idea where they are.
      await expect(headings, `${path} should have one h1`).toHaveCount(1);
      await expect(headings.first()).not.toBeEmpty();
    }
  });

  test("the skip link is the first thing a keyboard reaches, and it works", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    const focused = page.locator(":focus");
    await expect(focused).toContainText(/skip to content/i);

    await page.keyboard.press("Enter");
    // Without it, a keyboard user tabs through the whole header on every page.
    await expect(page).toHaveURL(/#main/);
  });

  test("every form control on the sign-in page has a real label", async ({ page }) => {
    await page.goto("/login");

    // Found by their accessible names, which only works if the labels are
    // properly associated rather than being placeholder text.
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByLabel(/^password/i)).toBeVisible();

    // The password visibility toggle is a real button with a name that changes
    // with its state, not an unlabelled icon.
    const toggle = page.getByRole("button", { name: /show password/i });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByRole("button", { name: /hide password/i })).toBeVisible();
  });

  test("a validation failure is announced, not just coloured red", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email address/i).fill("not-an-email");
    await page.getByLabel(/^password/i).fill("something");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    const field = page.getByLabel(/email address/i);
    // aria-invalid is what tells a screen reader the field is the problem, and
    // aria-describedby is what points it at the explanation.
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAttribute("aria-describedby", /.+/);
    await expect(page.getByText(/valid email address/i)).toBeVisible();
  });

  test("images carry alternative text that says what they are", async ({ page }) => {
    await page.goto("/cases");
    const images = page.locator("main img");
    const count = await images.count();

    for (let index = 0; index < count; index += 1) {
      const alt = await images.nth(index).getAttribute("alt");
      // Empty alt is legitimate for a decorative image; a missing attribute
      // means a screen reader reads out the file name instead.
      expect(alt, `image ${index} has no alt attribute`).not.toBeNull();
    }
  });

  test("the document declares its language", async ({ page }) => {
    await page.goto("/");
    // Without it a screen reader guesses the pronunciation, which makes English
    // content read as gibberish in a non-English voice.
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("zoom is not capped", async ({ page }) => {
    await page.goto("/");
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    // `maximum-scale=1` is a common default that stops a low-vision user
    // pinching to read, and buys nothing.
    expect(viewport).not.toContain("maximum-scale");
    expect(viewport).not.toContain("user-scalable=no");
  });
});

test.describe("layout", () => {
  /**
   * Widths chosen for what actually breaks at each: 320 is the narrowest phone
   * still in use, 768 is where a tablet layout has to decide, 1440 is a typical
   * laptop.
   */
  const WIDTHS = [320, 375, 768, 1024, 1440];

  test("no page scrolls sideways at any width", async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });

      for (const path of ["/", "/cases", "/safety", "/login"]) {
        await page.goto(path);
        // Settles any layout that depends on fonts having loaded.
        await page.waitForLoadState("networkidle");

        const overflow = await page.evaluate(() => {
          const documentWidth = document.documentElement.scrollWidth;
          const viewportWidth = document.documentElement.clientWidth;
          return documentWidth - viewportWidth;
        });

        // Horizontal scroll on a phone is the single most common way a
        // responsive layout is broken, and it makes a page genuinely hard to
        // read one-handed. One pixel of tolerance for sub-pixel rounding.
        expect(overflow, `${path} overflows by ${overflow}px at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("the mobile menu opens, navigates, and closes itself afterwards", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const opener = page.getByRole("button", { name: /open menu/i });
    await expect(opener).toBeVisible();
    await opener.click();

    const nav = page.locator("#mobile-navigation");
    await expect(nav).toBeVisible();

    await nav.getByRole("link", { name: /browse cases/i }).click();
    await expect(page).toHaveURL(/\/cases/);
    // Left open, it would cover the page it just navigated to.
    await expect(page.locator("#mobile-navigation")).toHaveCount(0);
  });

  test("discrete controls on a phone are big enough to hit", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/cases");

    /**
     * Buttons and card links only.
     *
     * WCAG 2.2's target-size rule exempts a link inside a sentence, and rightly
     * so — a 17px inline link in a paragraph is not a design failure, it is
     * text. Applying the rule to those produces a test that fails on correct
     * markup and gets suppressed. What is checked is the controls somebody
     * taps deliberately: buttons, and the links that behave like cards.
     */
    const controls = page.locator("main button:visible, main form a:visible, main article a:visible");
    const count = await controls.count();

    for (let index = 0; index < count; index += 1) {
      const box = await controls.nth(index).boundingBox();
      if (!box || box.height === 0) continue;
      // 24px is roughly where a target stops being reliably tappable one-handed.
      expect(box.height, `control ${index} is only ${box.height}px tall`).toBeGreaterThanOrEqual(24);
    }
  });
});
