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
 * If the narration the site serves exists (or `AUDIO=` names another file) it
 * becomes the audio track, and a narrated file is written beside the silent one.
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
 *   AUDIO      default public/walkthrough-narration.mp3, skipped if absent
 *   MUSIC      an optional bed; defaults to .media/Music.mp3 then
 *              .media/music-bed.mp3, and is skipped when neither exists
 *   MUSIC_LUFS target loudness for the bed, default -30 (voice is -20.3)
 *   FFMPEG     path to ffmpeg, if it is not on PATH
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  IS_TIMED_TO_RECORDING,
  NARRATION_AUDIO_SRC,
  SCENES,
  TOTAL_DURATION_MS,
  formatTimecode,
} from "../src/components/demo/script";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3200";
const OUT_DIR = resolve(process.env.OUT_DIR ?? "./.media");
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
/**
 * The narration to attach, if it has been recorded. Skipped when absent.
 *
 * The file the site serves, rather than a copy kept beside the exports. One
 * recording drives three things — the player fetches it, `sync-narration`
 * measures it, this muxes it — and a second copy is how the exported video ends
 * up cut to a different take from the one on the page.
 */
const AUDIO = process.env.AUDIO ?? join(process.cwd(), "public", NARRATION_AUDIO_SRC.slice(1));

/**
 * An optional music bed, laid under the narration in the export only.
 *
 * Opt-in, and deliberately so. Nothing on the website plays music: a page
 * somebody may open in a waiting room in the middle of an emergency is not a
 * place for a soundtrack, whereas a video they chose to press play on is.
 *
 * It is also a separate file rather than something mixed into the narration,
 * and that is not a preference. `sync-narration.ts` locates the chapter
 * boundaries by finding the silences between them; music fills those silences,
 * and mixing a bed into the narration takes the detector from ten gaps to zero.
 * Measured, not assumed. Music therefore never touches the file the timings are
 * derived from.
 *
 * `.media/Music.mp3` is a licensed track if you have one. `.media/music-bed.mp3`
 * is what `npm run music:bed` synthesises if you do not.
 */
const MUSIC = process.env.MUSIC ?? null;

/**
 * Where the bed sits, as an absolute loudness rather than an offset.
 *
 * An offset in decibels is the obvious control and the wrong one: it means
 * something entirely different depending on how loud the source is. Measured
 * here, the synthesised bed is -34.1 LUFS and a mastered track would typically
 * be nearer -14, so one `-22dB` setting would be reasonable for one and
 * inaudible for the other.
 *
 * Normalising to a target fixes that: whatever is dropped in lands in the same
 * place. The narration measures -20.3 LUFS, so -30 puts the bed about ten
 * decibels beneath it, and the sidechain then takes it a further six or seven
 * down under each line.
 *
 * -38 was the first value here, on the reasoning that eighteen decibels under
 * is where a bed is felt rather than heard. That is the right figure for a
 * full-range track through decent speakers and much too quiet for this one: a
 * bed already rolled off at 2 kHz, eighteen decibels down, through a laptop
 * speaker, is nothing at all. Audible in the gaps is the whole point of having
 * it; the ducking is what keeps it out of the way of the voice.
 */
const MUSIC_LUFS = process.env.MUSIC_LUFS ?? "-30";

/**
 * Finds the bed, preferring a real track over the generated one.
 *
 * Returns null when there is nothing to lay under the voice, which is the
 * default and a perfectly good outcome — the narration alone was the shipped
 * state and remains defensible.
 */
async function resolveMusic(): Promise<string | null> {
  const candidates = MUSIC
    ? [resolve(MUSIC)]
    : [join(OUT_DIR, "Music.mp3"), join(OUT_DIR, "music-bed.mp3")];

  for (const candidate of candidates) {
    const found = await stat(candidate).then(
      (info) => info.isFile(),
      () => false,
    );
    if (found) return candidate;
  }

  if (MUSIC) {
    throw new Error(`MUSIC was set to ${MUSIC}, which is not a file.`);
  }
  return null;
}

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

  const music = await resolveMusic();
  const narrated = videoPath.replace(/\.mp4$/, "-narrated.mp4");

  /*
    The voice, always. Duplicated to stereo at unity gain rather than passed
    through as mono.

    A generated voice track is usually mono, and a mono track is where this
    quietly goes wrong: several editors and a few players route it to the left
    channel only, so it plays half-missing or seems not to play at all. Which is
    not a fault anyone would look for in the file, because the file is fine.

    `pan` rather than `-ac 2`. The automatic mono-to-stereo conversion applies
    the usual -3dB per channel to preserve total power, which is right for music
    and wrong here: measured, it took a -20.9dB mean down to -24.0dB, so the
    narration simply arrives quieter than the recording that was approved.
    Copying the channel to both sides holds the level exactly.
  */
  const VOICE_TO_STEREO = "pan=stereo|c0=c0|c1=c0";

  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", videoPath, "-i", audio];

  if (music) {
    args.push("-i", music);
    /*
      The bed is ducked by the voice rather than simply set quiet.

      A fixed level cannot be right in both places: quiet enough to stay out of
      the way while somebody is speaking is inaudible in the pauses, and audible
      in the pauses is a competitor during the lines. `sidechaincompress` keyed
      off the narration pulls the music down whenever there is speech and lets it
      come back up in the gaps — which are exactly the twenty-three seconds this
      is here to fill.

      The release is long on purpose. A fast one pumps: the bed audibly surges
      between sentences, which draws attention to itself and is worse than
      silence.
    */
    args.push(
      "-filter_complex",
      [
        `[1:a]${VOICE_TO_STEREO},asplit=2[voice][key]`,
        // Looped first so a track shorter than the walkthrough still covers it,
        // then trimmed to length, then normalised. `loudnorm` runs at its own
        // internal rate, so the resample back to 48k is not optional.
        `[2:a]aloop=loop=-1:size=2147483647,atrim=0:${(TOTAL_DURATION_MS / 1000 + TAIL_MS / 1000).toFixed(2)},` +
          /*
            `dynaudnorm` before `loudnorm`, and it is the difference between a
            bed and a bed with a hole in it.

            `loudnorm` sets one level for the whole track, which is right, and
            says nothing about the level *within* it. A composed piece has
            structure: the track in use here measures -10.3dB at its peak and
            -24.9dB through a breakdown two minutes in, and a fourteen-decibel
            drop under narration does not read as musical dynamics — it reads as
            the music having stopped. Trimming to length cannot dodge it either,
            since no window of the required length misses the quiet passage.

            So passage-to-passage variation is levelled first, then the whole
            thing is placed. Measured on the track in use, this takes the spread
            across the video from 14.6dB to about 3dB.

            The window is roughly six seconds — `g` frames of `f` milliseconds.
            Long enough that this is a slow correction across passages rather
            than a compressor audibly chasing the music, which needs windows
            under a tenth of a second to start pumping. Tighter settings were
            measured and evened it out by a further half decibel, which is not
            worth processing a piece of music harder for.
          */
          `dynaudnorm=f=400:g=15:m=10,` +
          `loudnorm=I=${MUSIC_LUFS}:TP=-6:LRA=7,aresample=48000,` +
          `aformat=sample_fmts=fltp:channel_layouts=stereo,` +
          `afade=t=in:st=0:d=4,afade=t=out:st=${(TOTAL_DURATION_MS / 1000 - 3).toFixed(2)}:d=4[bed]`,
        /*
          Ratio 4, not 8.

          Eight took about twelve decibels out of the bed under every line,
          which keeps the voice unmistakably in front and makes the music
          disappear and reappear around each sentence — audible as an effect,
          and the opposite of a bed that is simply always there. Four lands
          nearer six or seven decibels: the narration still leads by a wide
          margin, and the music stays continuously present underneath it.
        */
        `[bed][key]sidechaincompress=threshold=0.03:ratio=4:attack=25:release=900[ducked]`,
        // `normalize=0`, or amix halves both inputs and the levels set above
        // stop meaning anything.
        `[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]`,
      ].join(";"),
      "-map", "0:v",
      "-map", "[mix]",
    );
  } else {
    args.push("-filter:a", VOICE_TO_STEREO);
  }

  args.push(
    // The picture is already right, so it is copied rather than re-encoded.
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "160k",
    // 48kHz, which is what video audio is expected to be; 44.1k in an MP4 makes
    // some editors resample on import.
    "-ar", "48000",
    // Ends with whichever track runs out first. Both are cut to the same
    // boundaries, so this only trims frames off the held final scene.
    "-shortest",
    "-movflags", "+faststart",
    narrated,
  );

  await run(FFMPEG, args);

  const { size: narratedSize } = await stat(narrated);
  console.log(
    `\n[record] narrated MP4: ${narrated}\n` +
      `[record] video copied, audio re-encoded to stereo AAC, ` +
      `${(narratedSize / 1024 / 1024).toFixed(1)} MB\n` +
      "[record] this is the one with sound. The other file is silent.",
  );

  /*
    Says outright whether a bed went in.

    The same lesson as naming which of the two files has sound: this script
    already shipped a version whose output was not what the operator assumed,
    and silence about an optional step is how that happens. Either it names the
    track and its level, or it says there was none and how to add one.
  */
  console.log(
    music
      ? `[record] music: ${music.split(/[\\/]/).pop()} at ${MUSIC_LUFS} LUFS, ducked under the voice`
      : "[record] music: none. `npm run music:bed` makes a minimal one, or drop a\n" +
        "         licensed track at .media/Music.mp3 and record again.",
  );
}

main().catch((error) => {
  console.error(`[record] failed\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
