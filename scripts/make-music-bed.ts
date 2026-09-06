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
 * - **Fundamentals between 220 Hz and 660 Hz.** The first version of this put
 *   everything below 250 Hz on the reasoning that speech occupies 300 Hz to
 *   3.4 kHz, so a bed underneath it would mask nothing. That is true and it was
 *   still wrong: laptop and phone speakers roll off hard below 300–400 Hz, so
 *   the entire bed sat in the one band the likely playback device cannot
 *   reproduce. Measured, 100% of its energy was below 200 Hz and it was
 *   inaudible in practice. Keeping out of the way is the job of level and
 *   ducking, not of hiding below the speech band.
 * - **Lowpassed at 2 kHz.** Below the 2–4 kHz band that carries consonants and
 *   therefore intelligibility, which is the part of speech worth protecting.
 * - **Two oscillators a fraction apart.** The slow beating between 220 Hz and
 *   220.7 Hz is what stops a sustained tone sounding like a test signal.
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
 * A3 and a hair-sharp A3 carry it, with E4 and B4 opening the chord and E5 for
 * air. A2 stays in at a low level so the bed has some body on speakers that can
 * actually produce it, but nothing depends on hearing it. No third anywhere.
 */
const VOICES: readonly { hz: number; db: number }[] = [
  { hz: 110, db: -20 },
  { hz: 220, db: -8 },
  { hz: 220.7, db: -11 },
  { hz: 329.63, db: -12 },
  { hz: 493.88, db: -17 },
  { hz: 659.25, db: -23 },
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
    // Below the 2-4kHz band that carries consonants, so the bed cannot eat
    // intelligibility even where it overlaps the voice.
    "[moved]lowpass=f=2000[under]",
    // Enough reflection to suggest a room. Any more and it becomes a texture
    // the listener notices, which is the opposite of the point.
    "[under]aecho=0.8:0.85:900|1700:0.28|0.18[spaced]",
    `[spaced]afade=t=in:st=0:d=6,afade=t=out:st=${(seconds - 6).toFixed(2)}:d=6[faded]`,
    // Stereo, and at a level the mix step can then place precisely.
    "[faded]pan=stereo|c0=c0|c1=c0,volume=-3dB[out]",
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
