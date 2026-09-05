import { expect, test } from "@playwright/test";

/**
 * The walkthrough's narration, in a real browser.
 *
 * Worth its own file because none of it can be checked anywhere else. Whether
 * an audio element is in the markup is a unit-testable fact and close to
 * worthless; whether the browser actually fetches the file, actually plays it,
 * and actually stops when told to are properties of a browser holding a real
 * media element, and they are the ones that break.
 *
 * The reason for the caution is that this exact feature already shipped once
 * as "working" and was silent where it mattered — the exported video carried
 * the voice while the deployed page did not. Nothing in the suite noticed,
 * because nothing in the suite listened.
 */

test.describe("the walkthrough narration", () => {
  test("serves the narration as a real audio file", async ({ request }) => {
    const response = await request.get("/walkthrough-narration.mp3");

    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("audio");
    // A 404 page or an HTML error would still be "ok" by some measures, so the
    // size is checked too: this is a two-and-a-half-minute recording.
    const body = await response.body();
    expect(body.byteLength).toBeGreaterThan(500_000);
  });

  test("plays the narration once somebody presses play, and the picture follows it", async ({
    page,
  }) => {
    await page.goto("/");

    const play = page.getByRole("button", { name: /watch how locora works/i });
    await play.scrollIntoViewIfNeeded();
    await play.click();

    // The transport appearing is what tells us the player has hydrated and
    // taken over from the poster frame.
    await expect(page.getByRole("button", { name: /^pause$/i })).toBeVisible();

    const audio = page.locator("audio");
    await expect(audio).toHaveCount(1);

    /*
      Playback is asserted through the element's own state rather than by
      listening, which a headless browser cannot do. `paused` going false after
      a click is the difference between an element that exists and a narration
      that is running.
    */
    await expect
      .poll(async () => audio.evaluate((el: HTMLAudioElement) => el.paused), { timeout: 15_000 })
      .toBe(false);

    await expect
      .poll(async () => audio.evaluate((el: HTMLAudioElement) => el.currentTime), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0.5);

    // And the timeline is reading that clock rather than running beside it: the
    // transport's elapsed time should be within a second of the audio's.
    const drift = await page.evaluate(() => {
      const el = document.querySelector("audio") as HTMLAudioElement | null;
      return el ? el.currentTime : -1;
    });
    expect(drift).toBeGreaterThan(0);
  });

  test("mutes on request, and remembers the choice on the next visit", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /watch how locora works/i }).click();
    await expect(page.getByRole("button", { name: /^pause$/i })).toBeVisible();

    const audio = page.locator("audio");
    await expect
      .poll(async () => audio.evaluate((el: HTMLAudioElement) => el.paused), { timeout: 15_000 })
      .toBe(false);

    await page.getByRole("button", { name: /mute the narration/i }).click();

    // Muting stops the audio outright rather than turning its volume down, so
    // nothing continues to stream in the background.
    await expect
      .poll(async () => audio.evaluate((el: HTMLAudioElement) => el.paused), { timeout: 10_000 })
      .toBe(true);

    await expect(page.getByRole("button", { name: /play the narration aloud/i })).toBeVisible();

    // The walkthrough must keep running without the audio, on its own clock.
    const before = await page.evaluate(() =>
      document.body.textContent?.match(/(\d+):(\d\d) \//)?.[0] ?? "",
    );
    await page.waitForTimeout(2_500);
    const after = await page.evaluate(() =>
      document.body.textContent?.match(/(\d+):(\d\d) \//)?.[0] ?? "",
    );
    expect(after, "the walkthrough should keep playing while muted").not.toBe(before);

    // Reloading is the point: a preference nobody remembers is a preference
    // somebody has to set again every time.
    await page.reload();
    await page.getByRole("button", { name: /watch how locora works/i }).click();
    await expect(page.getByRole("button", { name: /play the narration aloud/i })).toBeVisible();

    const stillMuted = page.locator("audio");
    await expect(stillMuted).toHaveCount(1);
    await expect
      .poll(async () => stillMuted.evaluate((el: HTMLAudioElement) => el.paused), {
        timeout: 10_000,
      })
      .toBe(true);
  });

  test("says on the poster frame that it is narrated", async ({ page }) => {
    await page.goto("/");
    // The page told visitors it had no sound for as long as that was true. A
    // stale promise in the other direction is the same defect.
    await expect(page.getByText(/narrated/i).first()).toBeVisible();
    await expect(page.getByText(/no sound/i)).toHaveCount(0);
  });
});
