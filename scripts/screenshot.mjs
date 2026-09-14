/**
 * Captures the key screens for visual review.
 *
 * Not a test — nothing here asserts. It exists so the interface can actually be
 * looked at rather than inferred from passing selectors, which is a different
 * question: a page can satisfy every locator in the suite and still be ugly,
 * cramped, or wrong at a width nobody checked.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.SHOT_BASE_URL ?? "http://127.0.0.1:3200";
const OUT = process.env.SHOT_DIR ?? "./.shots";

const REPORTER = { email: "reporter@locora.test", password: "E2ePassphrase1" };
const REVIEWER = { email: "reviewer@locora.test", password: "E2ePassphrase1" };

const PUBLIC_SHOTS = [
  // Two shots of the same page, deliberately. The full-page one is for looking
  // at the landing page as a whole; the viewport-height one is what a document
  // embeds, where a 5,000px-tall image is unreadable at any width.
  ["home-hero", "/", 1440, 900, false],
  ["home-desktop", "/", 1440, 900, true],
  ["home-mobile", "/", 390, 844, true],
  ["cases-desktop", "/cases", 1440, 900, false],
  ["cases-mobile", "/cases", 390, 844, false],
  ["how-it-works", "/how-it-works", 1440, 900, false],
  ["safety", "/safety", 1440, 900, false],
  ["login", "/login", 1440, 900, false],
  ["register", "/register", 1440, 900, false],
  ["login-mobile", "/login", 390, 844, false],
  ["not-found", "/nope", 1440, 900, false],
];

async function signIn(page, who) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email address/i).fill(who.email);
  await page.getByLabel(/^password/i).fill(who.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

async function shoot(page, name, path, width, height, full) {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  // Let fonts settle and any entrance animation finish before capturing.
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log("captured", name);
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

try {
  const anon = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await anon.newPage();
  for (const [name, path, w, h, full] of PUBLIC_SHOTS) {
    await shoot(page, name, path, w, h, full);
  }

  // The demo player has to be started before it can be photographed.
  //
  // The play button does nothing until React has hydrated, and `networkidle`
  // does not guarantee that — so the click is retried until the transport
  // actually appears rather than assumed to have landed. This is a property of
  // any client-rendered control, not of this one.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const playButton = page.getByRole("button", { name: /watch how locora works/i });
  const pauseButton = page.getByRole("button", { name: /^pause$/i });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await pauseButton.isVisible().catch(() => false)) break;
    await playButton.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
  await pauseButton.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/demo-playing.png` });
  console.log("captured demo-playing");
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /transcript/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/demo-transcript.png` });
  console.log("captured demo-transcript");
  await anon.close();

  const reporterCtx = await browser.newContext({ deviceScaleFactor: 1 });
  const reporterPage = await reporterCtx.newPage();
  await signIn(reporterPage, REPORTER);
  for (const [name, path, w, h, full] of [
    ["dashboard", "/dashboard", 1440, 900, false],
    ["report-chooser", "/report", 1440, 900, false],
    ["report-missing", "/report/missing", 1440, 1000, false],
    ["report-missing-mobile", "/report/missing", 390, 844, false],
    ["notifications", "/notifications", 1440, 900, false],
    ["settings", "/settings", 1440, 900, false],
  ]) {
    await shoot(reporterPage, name, path, w, h, full);
  }
  await reporterCtx.close();

  const reviewerCtx = await browser.newContext({ deviceScaleFactor: 1 });
  const reviewerPage = await reviewerCtx.newPage();
  await signIn(reviewerPage, REVIEWER);
  for (const [name, path, w, h, full] of [
    ["review-queue", "/review/queue", 1440, 1000, false],
    ["review-queue-mobile", "/review/queue", 390, 844, false],
    ["review-matches", "/review/matches", 1440, 1000, false],
    ["review-users", "/review/users", 1440, 900, false],
    ["review-audit", "/review/audit", 1440, 900, false],
    ["review-flags", "/review/flags", 1440, 900, false],
    ["case-detail", "/cases", 1440, 1000, false],
  ]) {
    await shoot(reviewerPage, name, path, w, h, full);
  }

  // A case page, reached by clicking through so the id does not have to be known.
  await reviewerPage.goto(`${BASE}/cases`, { waitUntil: "networkidle" });
  await reviewerPage.getByText("Aisha Khan").first().click();
  await reviewerPage.waitForTimeout(1200);
  await reviewerPage.screenshot({ path: `${OUT}/case-page.png`, fullPage: true });
  console.log("captured case-page");
  // The match builder, with candidates on screen rather than the empty state.
  //
  // Choosing a case is what fetches the ranking, so the select has to be driven
  // before there is anything to photograph. This is the one screen where the
  // product's central claim is visible — a ranked list whose every row says why
  // it ranked, and a human holding the only button that decides anything.
  await reviewerPage.setViewportSize({ width: 1440, height: 1000 });
  await reviewerPage.goto(`${BASE}/review/matches`, { waitUntil: "networkidle" });
  const caseSelect = reviewerPage.getByLabel(/missing-person case/i);
  await caseSelect.waitFor({ state: "visible", timeout: 15000 });
  const options = await caseSelect.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => node.value).filter(Boolean),
  );
  if (options.length > 0) {
    await caseSelect.selectOption(options[0]);
    // The ranking is fetched, so wait for the result rather than a fixed delay.
    await reviewerPage
      .getByText(/in common|no found-person report/i)
      .first()
      .waitFor({ state: "visible", timeout: 15000 });
    await reviewerPage.waitForTimeout(500);
    // Full page: the ranked candidates and their reasons sit below the fold of
    // a 1000px viewport, and they are the entire point of this capture.
    await reviewerPage.screenshot({
      path: `${OUT}/review-match-builder.png`,
      fullPage: true,
    });
    console.log("captured review-match-builder");
  } else {
    console.log("skipped review-match-builder — no missing case to rank against");
  }

  await reviewerCtx.close();

  // The dark theme.
  //
  // Set in localStorage before the first paint rather than by clicking the
  // toggle after load: the theme is applied by a blocking script on boot, so
  // driving it through storage photographs the same path a returning visitor
  // gets, and avoids catching a transition mid-flight.
  const darkCtx = await browser.newContext({ deviceScaleFactor: 1 });
  await darkCtx.addInitScript(() => {
    try {
      localStorage.setItem("locora-theme", "dark");
    } catch {
      // A context with storage denied still renders; it simply renders light.
    }
  });
  const darkPage = await darkCtx.newPage();
  for (const [name, path, w, h, full] of [
    ["home-dark", "/", 1440, 900, false],
    ["cases-dark", "/cases", 1440, 900, false],
    ["how-it-works-dark", "/how-it-works", 1440, 900, false],
    ["safety-dark", "/safety", 1440, 900, false],
  ]) {
    await shoot(darkPage, name, path, w, h, full);
  }
  await signIn(darkPage, REVIEWER);
  for (const [name, path, w, h, full] of [
    ["review-queue-dark", "/review/queue", 1440, 1000, false],
    ["dashboard-dark", "/dashboard", 1440, 900, false],
  ]) {
    await shoot(darkPage, name, path, w, h, full);
  }
  await darkCtx.close();
} finally {
  await browser.close();
}
