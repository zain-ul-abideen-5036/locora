/**
 * Records the landing-page walkthrough to a video file.
 *
 * ## Why this exists, given the walkthrough is deliberately not a video
 *
 * It still is not. The walkthrough on the site remains rendered DOM — crisp at
 * any width, translatable, readable by a screen reader, and impossible to leave
 * stale. Nothing here changes that, and the application does not know this
 * script exists.
 *
 * What this produces is an *export*: a file to hand to a voiceover tool, drop
 * into a pitch deck, or attach to an email, none of which accept a live web
 * page. The narration it pairs with is in `docs/NARRATION.md`, generated from
 * the same script that drives what is recorded here, so the two cannot describe
 * different products.
 *
 * The output is deliberately not committed. A two-minute video is several
 * megabytes of binary that changes wholesale on any visual edit, which is the
 * one thing a git history should never carry. This script is the artefact; the
 * file is a build product, and `.gitignore` keeps it out.
 *
 * ## How the resolution is achieved
 *
 * Playwright's video capture renders at the CSS viewport size and ignores
 * `deviceScaleFactor` — asking for a 2880x1800 recording of a 1440x900 viewport
 * yields the page drawn small in the top-left of a grey canvas, not a sharp
 * frame. Measured, not assumed; it is the first thing to try and it does not
 * work.
 *
 * So the sharpness comes from CSS zoom instead. The viewport is a true
 * 1920x1080, and `zoom` on the root element scales the rendering by 1.875 —
 * which is exactly the factor that takes the player's 896px container to 1680px
 * and leaves a margin. Modern Chromium evaluates media queries against the
 * unzoomed viewport, so the `lg` layout the walkthrough was tuned for stays in
 * effect; a naive approach of shrinking the viewport to enlarge the content
 * would drop below the `lg` breakpoint and record a different, narrower design
 * from the one on the site.
 *
 * The result is native 1080p with no upscaling anywhere in the chain.
 *
 * ## Why the header is hidden
 *
 * The site header is sticky, so it would sit across the top of every frame for
 * two and a half minutes, and "Sign in / Get started" is not part of what the
 * narration describes. Hiding it is a framing decision about the export, not a
 * change to the page: nothing else is touched, and the walkthrough itself is
 * recorded exactly as it renders, transport controls and captions included.
 *
 * ## The narration is muxed in when there is one
 *
 * If `.media/Voice.mp3` exists (or `AUDIO=` names another file) it becomes the
 * audio track and a second, narrated file is written beside the silent one.
 * That is only honest if the picture is actually cut to that recording, so it is
 * refused unless `sync-narration.ts` has measured the audio and written the real
 * scene boundaries into `src/components/demo/timings.ts`. Recording a budgeted
 * timeline against a real voice yields a file that looks right for the first
 * chapter and drifts thereafter — which is harder to spot than no audio at all.
 *
 * ## Usage
 *
 *   tsx scripts/record-walkthrough.ts
 *
 * Requires a server already running (`next start`) and, for MP4, ffmpeg with
 * libx264. Without ffmpeg it stops at the WebM and says so — it does not
 * silently hand back a file in a format that was not asked for.
 *
 *   BASE_URL   default http://127.0.0.1:3200
 *   OUT_DIR    default ./.media
 *   AUDIO      default <OUT_DIR>/Voice.mp3, skipped if absent
 *   FFMPEG     path to ffmpeg, if it is not on PATH
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  IS_TIMED_TO_RECORDING,
  SCENES,
  TOTAL_DURATION_MS,
  formatTimecode,
} from "../src/components/demo/script";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3200";
const OUT_DIR = resolve(process.env.OUT_DIR ?? "./.media");
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
/** The narration to attach, if it has been recorded. Skipped when absent. */
const AUDIO = process.env.AUDIO ?? join(OUT_DIR, "Voice.mp3");

/** 896px container x 1.875 = 1680px, inside a 1920px frame. See the note above. */
const ZOOM = 1.875;
const FRAME = { width: 1920, height: 1080 };

/**
 * Recording continues a little past the end of the timeline.
 *
 * The last scene should be allowed to sit on screen rather than being cut on
 * its final frame, and the player's own state settles a beat after the playhead
 * reaches the end.
 */
const TAIL_MS = 1_800;

function run(command: string, args: string[]): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited ${code}\n${stderr.slice(-1500)}`));
    });
  });
}

async function hasFfmpeg() {
  try {
    await run(FFMPEG, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const raw = join(OUT_DIR, "raw");
  await rm(raw, { recursive: true, force: true });
  await mkdir(raw, { recursive: true });

  console.log(
    `[record] ${SCENES.length} chapters, ${formatTimecode(TOTAL_DURATION_MS)} — ` +
      `this runs in real time, so it will take about that long.`,
  );
  console.log(
    IS_TIMED_TO_RECORDING
      ? "[record] timeline is measured from a recording, so it can carry audio"
      : "[record] timeline is the written budget; no recording has been measured",
  );

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: FRAME,
    recordVideo: { dir: raw, size: FRAME },
    // The walkthrough has a reduced-motion path that renders a static
    // storyboard instead of a timeline. Recording that would produce a video of
    // a document, so the preference is explicitly not set.
    reducedMotion: "no-preference",
  });

  const page = await context.newPage();
  // Playwright begins recording at page creation, so everything from here to
  // the moment playback starts is preamble that gets trimmed off the front.
  const recordingStartedAt = Date.now();

  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  await page.evaluate((zoom) => {
    document.documentElement.style.zoom = String(zoom);
    // Sticky, so otherwise it occupies the top of every frame. Hidden rather
    // than scrolled past, because sticky means scrolling does not remove it.
    const header = document.querySelector("body > header, header");
    if (header instanceof HTMLElement) header.style.display = "none";
  }, ZOOM);
  await page.waitForTimeout(500);

  const section = page.locator("section", {
    has: page.getByRole("heading", { name: /see it work/i }),
  });
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  /*
    The play button lives in the poster frame and does nothing until React has
    hydrated, which `networkidle` does not imply — so the click is retried until
    the transport actually appears rather than assumed to have landed.
  */
  const play = page.getByRole("button", { name: /watch how locora works/i });
  const pause = page.getByRole("button", { name: /^pause$/i });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await pause.isVisible().catch(() => false)) break;
    await play.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  await pause.waitFor({ state: "visible", timeout: 20_000 });
  const playbackStartedAt = Date.now();

  /*
    Centred by setting the scroll position outright rather than by
    `scrollIntoViewIfNeeded`, which stops as soon as the element is merely
    visible and would leave the player against one edge of the frame.
  */
  const group = page.getByRole("group", { name: /animated walkthrough/i });
  const box = await group.boundingBox();
  if (!box) throw new Error("the walkthrough player is not on the page");

  const targetTop = Math.max(0, Math.round((FRAME.height - box.height) / 2));
  await page.evaluate(
    ({ delta }) => window.scrollBy(0, delta),
    { delta: Math.round(box.y - targetTop) },
  );
  await page.waitForTimeout(250);

  const framed = await group.boundingBox();
  if (framed) {
    console.log(
      `[record] player framed at ${Math.round(framed.width)}x${Math.round(framed.height)} ` +
        `in ${FRAME.width}x${FRAME.height}`,
    );
  }

  await page.waitForTimeout(TOTAL_DURATION_MS + TAIL_MS);

  // Closing the context is what finalises the video file.
  await context.close();
  await browser.close();

  const written = (await readdir(raw)).find((name) => name.endsWith(".webm"));
  if (!written) throw new Error("Playwright wrote no video file");

  const webm = join(OUT_DIR, "locora-walkthrough.webm");
  await rename(join(raw, written), webm);
  await rm(raw, { recursive: true, force: true });

  // How much of the front is preamble: navigation, hydration and the click.
  const trimSeconds = (playbackStartedAt - recordingStartedAt) / 1000;
  console.log(`[record] trimming ${trimSeconds.toFixed(1)}s of preamble`);

  if (!(await hasFfmpeg())) {
    console.log(
      `\n[record] WebM written: ${webm}\n` +
        "[record] ffmpeg was not found, so no MP4 was produced. Install ffmpeg\n" +
        "         (or set FFMPEG=/path/to/ffmpeg) and run this again.\n" +
        "         Note that the ffmpeg bundled with Playwright cannot do this —\n" +
        "         it is built with --disable-everything and has no H.264 encoder.",
    );
    return;
  }

  const mp4 = join(OUT_DIR, "locora-walkthrough.mp4");
  await run(FFMPEG, [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    // Before -i, so the seek is done by demuxing rather than by decoding and
    // discarding two seconds of frames.
    "-ss", trimSeconds.toFixed(3),
    "-i", webm,
    // Constant frame rate. The capture is variable, and a VFR MP4 is what makes
    // an editor's audio drift away from the picture over two minutes.
    "-r", "25",
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "20",
    // Required by QuickTime, PowerPoint, and most things that will be asked to
    // open this. libx264 would otherwise pick yuv444p from RGB input.
    "-pix_fmt", "yuv420p",
    // Moves the index to the front so it can start playing before it has
    // finished downloading.
    "-movflags", "+faststart",
    "-an",
    mp4,
  ]);

  const { size } = await stat(mp4);
  console.log(
    `\n[record] silent MP4: ${mp4}\n` +
      `[record] ${FRAME.width}x${FRAME.height}, 25fps, ${(size / 1024 / 1024).toFixed(1)} MB`,
  );

  await muxNarration(mp4);
}

/**
 * Attaches the recorded narration, when there is one to attach.
 *
 * Refused outright if the timeline is still the written budget. A silent video
 * cut to a forecast is fine — it is honest about being a forecast — but pairing
 * it with a real voice produces something that looks correct for one chapter and
 * is visibly wrong by the last, which is harder to notice than no audio at all
 * and worse.
 */
async function muxNarration(videoPath: string): Promise<void> {
  const audio = resolve(AUDIO);
  const present = await stat(audio).then(
    (info) => info.isFile(),
    () => false,
  );

  if (!present) {
    console.log(
      `[record] no narration at ${audio}, so the silent file is the output.\n` +
        "[record] to add one: generate it from docs/NARRATION.md, save it there,\n" +
        "         run `npm run narration:sync -- <file> --write`, then record again.",
    );
    return;
  }

  if (!IS_TIMED_TO_RECORDING) {
    console.log(
      `[record] found ${audio}, but the timeline has not been measured against\n` +
        "         it, so it was NOT muxed — the picture would drift from the voice.\n" +
        "         Run `npm run narration:sync -- <file> --write`, then record again.",
    );
    return;
  }

  const narrated = videoPath.replace(/\.mp4$/, "-narrated.mp4");
  await run(FFMPEG, [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", videoPath,
    "-i", audio,
    // The picture is already right, so it is copied rather than re-encoded.
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "160k",
    // Ends with whichever track runs out first. Both are cut to the same
    // boundaries, so this only trims frames off the held final scene.
    "-shortest",
    "-movflags", "+faststart",
    narrated,
  ]);

  const { size: narratedSize } = await stat(narrated);
  console.log(
    `\n[record] narrated MP4: ${narrated}\n` +
      `[record] video copied, audio re-encoded to AAC, ` +
      `${(narratedSize / 1024 / 1024).toFixed(1)} MB`,
  );
}

main().catch((error) => {
  console.error(`[record] failed\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
