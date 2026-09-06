/**
 * Prepares the music bed the website serves, from the source track.
 *
 * ## Why the site needs its own file
 *
 * The exported video gets its bed mixed in by ffmpeg, which can duck it against
 * the narration with a sidechain compressor. A browser has no such thing: it has
 * two `<audio>` elements and a `volume` property. So the balancing that ffmpeg
 * does at export time has to be split in two — the parts that can be baked into
 * a file are done here, and the part that has to react to the narration is done
 * in the player.
 *
 * Baked in here:
 *
 * - **Trimmed to the walkthrough's length**, so the bed ends when the picture
 *   does and the fade lands in the right place. The source is longer.
 * - **Levelled passage to passage** with `dynaudnorm`, for the same reason as
 *   the export: this track runs fourteen decibels quieter through a breakdown
 *   two minutes in, and underneath narration that reads as the music having
 *   stopped rather than as dynamics.
 * - **Normalised to a known loudness.** This is what makes the player's
 *   `volume` numbers mean something. Without it, swapping the source track for
 *   a louder or quieter one would silently change the balance on the site.
 * - **Re-encoded smaller.** The source is 3:56 at 160kbps; the site needs 2:34,
 *   and it is fetched by everybody who presses play.
 *
 * Left to the player: raising the bed slightly in the gaps between chapters and
 * dropping it under each line. See `demo-player.tsx`.
 *
 * ## Attribution
 *
 * This writes a third-party track into `public/`, which means it ships to every
 * visitor. Freely-downloadable music is frequently Creative Commons with
 * attribution required, so the credit is declared in `script.ts` beside the
 * source path and rendered in the walkthrough. Verify the licence on the page
 * the track came from; this script cannot.
 *
 * ## Usage
 *
 *   npm run music:web                      # from .media/Music.mp3
 *   SOURCE=path/to/track.mp3 npm run music:web
 */
import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  NARRATION_AUDIO_SRC,
  SITE_MUSIC_SRC,
  TOTAL_DURATION_MS,
  formatTimecode,
} from "../src/components/demo/script";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const SOURCE = resolve(process.env.SOURCE ?? join("./.media", "Music.mp3"));
const OUTPUT = resolve(join("./public", SITE_MUSIC_SRC.slice(1)));

/**
 * The loudness the file is normalised to.
 *
 * Not the loudness it plays at — the player attenuates it heavily. This is a
 * reference point, chosen as an ordinary level for a music file so that the
 * player's `volume` values read as sensible fractions rather than as a
 * correction for whatever the source happened to be.
 *
 * The narration is -20.3 LUFS at full volume, so at the player's 0.16 this
 * lands around -34 LUFS: roughly fourteen decibels under the voice.
 */
const TARGET_LUFS = process.env.TARGET_LUFS ?? "-18";

function run(command: string, args: string[]): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited ${code}\n${stderr.slice(-1200)}`));
    });
  });
}

async function main(): Promise<void> {
  const present = await stat(SOURCE).then(
    (info) => info.isFile(),
    () => false,
  );
  if (!present) {
    throw new Error(
      `no source track at ${SOURCE}.\n` +
        "  Put one there, or pass SOURCE=path/to/track.mp3.",
    );
  }

  await mkdir(resolve("./public"), { recursive: true });

  const seconds = TOTAL_DURATION_MS / 1000;

  await run(FFMPEG, [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", SOURCE,
    "-filter_complex",
    [
      // Looped before trimming, so a source shorter than the walkthrough still
      // covers it rather than ending early.
      `[0:a]aloop=loop=-1:size=2147483647,atrim=0:${seconds.toFixed(2)}`,
      // Levelled before it is placed. See the note above.
      "dynaudnorm=f=400:g=15:m=10",
      `loudnorm=I=${TARGET_LUFS}:TP=-2:LRA=7`,
      "aresample=44100",
      // Long fades. The bed should arrive and leave without either being an
      // event, and the tail has to be clear before the last frame.
      `afade=t=in:st=0:d=5,afade=t=out:st=${(seconds - 5).toFixed(2)}:d=5`,
      "aformat=sample_fmts=fltp:channel_layouts=stereo[out]",
    ].join(","),
    "-map", "[out]",
    "-c:a", "libmp3lame",
    // Everybody who presses play fetches this, so it is not the place for
    // 320kbps. 128 is transparent enough for a bed at a sixth of full volume.
    "-b:a", "128k",
    OUTPUT,
  ]);

  const { size } = await stat(OUTPUT);
  const narration = await stat(resolve(join("./public", NARRATION_AUDIO_SRC.slice(1)))).then(
    (info) => info.size,
    () => 0,
  );

  console.log(
    `[web-music] wrote ${OUTPUT}\n` +
      `[web-music] ${formatTimecode(TOTAL_DURATION_MS)}, normalised to ${TARGET_LUFS} LUFS, ` +
      `${(size / 1024 / 1024).toFixed(1)} MB` +
      (narration ? ` (narration is ${(narration / 1024 / 1024).toFixed(1)} MB)` : "") +
      `\n[web-music] the credit in script.ts must match whatever track this was.`,
  );
}

main().catch((error: unknown) => {
  console.error(`[web-music] failed\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
