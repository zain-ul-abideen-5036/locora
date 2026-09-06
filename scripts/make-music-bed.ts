/**
 * Synthesises a minimal ambient bed for the exported walkthrough.
 *
 * ## Why this is generated rather than sourced
 *
 * Not because generating music is better than licensing it — it plainly is not.
 * It is here so the mixing pipeline has something to work with out of the box,
 * and so anybody can hear what the levels do before deciding whether to pay for
 * a track. Drop a real one at `.media/Music.mp3` and this is never used.
 *
 * ## Why it sounds the way it does
 *
 * The constraint that matters is tone, not production value. This is a product
 * about missing people, and the fastest way to make it feel like it is
 * exploiting that is to put swelling minor-key piano under the narration. The
 * narration itself was written to avoid drama; music can undo that in eight
 * seconds.
 *
 * So the bed is deliberately inert:
 *
 * - **One chord for the whole runtime.** No progression, so nothing resolves,
 *   builds or turns sad. An open A-B-E voicing — a second and a fifth, no
 *   third — which is the interval set that refuses to be either major or minor.
 *   It cannot editorialise because it has no third to editorialise with.
 * - **Everything below 250 Hz, lowpassed at 900.** Speech carries between about
 *   300 Hz and 3.4 kHz, so a bed that lives underneath it masks nothing. This
 *   is also why it can sit at a usable level without fighting the voice.
 * - **Two oscillators a fraction apart.** The slow beating between 110 Hz and
 *   110.4 Hz is what stops a sustained tone sounding like a test signal.
 * - **A very slow tremolo,** so it breathes rather than sits.
 *
 * ## Usage
 *
 *   npm run music:bed              # writes .media/music-bed.mp3
 *   FFMPEG=/path/to/ffmpeg npm run music:bed
 *
 * Then `npm run record:walkthrough` mixes it in. Nothing on the website plays
 * music: a page somebody may open in a waiting room is not a place for it, and
 * the walkthrough there stays narration-only.
 */
import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { TOTAL_DURATION_MS, formatTimecode } from "../src/components/demo/script";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const OUT_DIR = resolve(process.env.OUT_DIR ?? "./.media");
const OUTPUT = join(OUT_DIR, "music-bed.mp3");

/** A couple of seconds past the picture, so the fade has somewhere to land. */
const TAIL_S = 3;

/**
 * The voicing, in hertz, with the level each is mixed at.
 *
 * A2, a hair-sharp A2, E3, B3, plus a sub an octave down and one quiet upper
 * partial for body. No third anywhere.
 */
const VOICES: readonly { hz: number; db: number }[] = [
  { hz: 55, db: -14 },
  { hz: 110, db: -8 },
  { hz: 110.4, db: -11 },
  { hz: 164.81, db: -13 },
  { hz: 246.94, db: -19 },
  { hz: 329.63, db: -26 },
];

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
  await mkdir(OUT_DIR, { recursive: true });

  const seconds = TOTAL_DURATION_MS / 1000 + TAIL_S;

  const inputs: string[] = [];
  for (const voice of VOICES) {
    inputs.push("-f", "lavfi", "-i", `sine=frequency=${voice.hz}:duration=${seconds.toFixed(2)}`);
  }

  const legs = VOICES.map((voice, index) => `[${index}:a]volume=${voice.db}dB[v${index}]`);
  const mixInputs = VOICES.map((_, index) => `[v${index}]`).join("");

  const filter = [
    ...legs,
    // `normalize=0`, or ffmpeg divides everything by the input count and the
    // careful per-voice levels above stop meaning anything.
    `${mixInputs}amix=inputs=${VOICES.length}:normalize=0[chord]`,
    // Breathing, not pulsing: 0.1Hz is one slow swell every ten seconds, which
    // is the floor ffmpeg's tremolo allows and about right anyway.
    "[chord]tremolo=f=0.1:d=0.35[moved]",
    // Under the voice, not beside it.
    "[moved]lowpass=f=900[under]",
    // Enough reflection to suggest a room. Any more and it becomes a texture
    // the listener notices, which is the opposite of the point.
    "[under]aecho=0.8:0.85:900|1700:0.28|0.18[spaced]",
    `[spaced]afade=t=in:st=0:d=6,afade=t=out:st=${(seconds - 6).toFixed(2)}:d=6[faded]`,
    // Stereo, and at a level the mix step can then place precisely.
    "[faded]pan=stereo|c0=c0|c1=c0,volume=-6dB[out]",
  ].join(";");

  await run(FFMPEG, [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    ...inputs,
    "-filter_complex", filter,
    "-map", "[out]",
    "-c:a", "libmp3lame",
    "-b:a", "160k",
    "-ar", "48000",
    OUTPUT,
  ]);

  const { size } = await stat(OUTPUT);
  console.log(
    `[music] wrote ${OUTPUT}\n` +
      `[music] ${formatTimecode(seconds * 1000)}, one open chord, ${(size / 1024 / 1024).toFixed(1)} MB\n` +
      `[music] listen to it before shipping it. A licensed track at .media/Music.mp3\n` +
      `        takes precedence and will almost certainly sound better.`,
  );
}

main().catch((error: unknown) => {
  console.error(`[music] failed\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
