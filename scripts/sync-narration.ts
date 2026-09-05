/**
 * Measures a recorded narration and corrects the walkthrough's timings to match it.
 *
 * ## The problem this solves
 *
 * Every `speechMs` in `src/components/demo/script.ts` is an estimate. They were
 * derived from a words-per-second budget, which is the right way to *write* a
 * script — it is what stops a line being written that cannot be spoken — but it
 * is a prediction, not a measurement. A real voice, or a particular
 * text-to-speech voice at particular settings, will not hit 2.55 words per
 * second on every line, and it has no reason to.
 *
 * Small errors here do not stay small. They accumulate: a chapter read one
 * second quicker than budgeted shifts every subsequent chapter by a second, and
 * by the tenth the caption on screen is describing something the narrator
 * finished talking about a while ago. Nothing warns you. The video plays, the
 * audio plays, and the result simply feels slightly wrong in a way that is hard
 * to point at.
 *
 * ## How it measures
 *
 * The pauses between chapters are the key. They are near-silent and a known
 * length — `NARRATION_BREAK_MS`, emitted as an ElevenLabs `<break>` tag — which
 * makes them findable in the waveform, and once they are found the speech
 * between them is measured rather than guessed.
 *
 * So: `silencedetect` locates the gaps, and each chapter's real extent — the
 * line plus the pause after it — is taken from where the narrator actually
 * stops and starts. `--write` puts those into `src/components/demo/timings.ts`,
 * which the walkthrough prefers over its own budget. Regenerate the narration
 * document, re-record, and the picture is cut to the voice rather than to a
 * forecast of it.
 *
 * The budget in `script.ts` is deliberately left alone. It is what the copy was
 * written for; overwriting it with what a voice happened to do would let a
 * rushed take redefine "unhurried", and the speaking-rate check would then be
 * validating the script against itself.
 *
 * Read-only unless `--write` is passed. It prints the drift either way, which
 * is worth seeing on its own: a chapter three seconds off its budget usually
 * means the copy wants changing, not the timing.
 *
 * ## Usage
 *
 *   tsx scripts/sync-narration.ts narration.mp3
 *   tsx scripts/sync-narration.ts narration.mp3 --write
 *
 *   FFMPEG=/path/to/ffmpeg   if it is not on PATH
 *
 * Any format ffmpeg can decode will do — mp3, wav, m4a, flac.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  NARRATION_BREAK_MS,
  SCENES,
  SPOKEN_WPS_MAX,
  formatTimecode,
  narrationWordCount,
} from "../src/components/demo/script";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const TIMINGS_PATH = resolve(process.cwd(), "src", "components", "demo", "timings.ts");

/**
 * -45dB is quiet enough that no speech reaches it and loud enough that an
 * encoder's noise floor does not stop a real gap being seen. The minimum
 * duration is deliberately well under the break: a break that comes back as
 * 1.8s because of how the encoder trimmed it is still the break.
 */
const SILENCE_DB = -45;
const MIN_SILENCE_S = (NARRATION_BREAK_MS / 1000) * 0.55;

function ffmpeg(args: string[]): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", () => resolvePromise(stderr));
  });
}

interface Gap {
  start: number;
  end: number;
}

async function measure(audioPath: string): Promise<{ totalS: number; gaps: Gap[] }> {
  const output = await ffmpeg([
    "-hide_banner",
    "-nostats",
    "-i", audioPath,
    "-af", `silencedetect=noise=${SILENCE_DB}dB:d=${MIN_SILENCE_S}`,
    "-f", "null",
    "-",
  ]);

  const totalMatch = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(output);
  if (!totalMatch) {
    throw new Error(
      `ffmpeg could not read "${audioPath}" as audio.\n` +
        output.split("\n").slice(-6).join("\n"),
    );
  }
  const [, hours = "0", minutes = "0", seconds = "0"] = totalMatch;
  const totalS = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);

  const gaps: Gap[] = [];
  let open: number | null = null;
  for (const line of output.split("\n")) {
    const start = /silence_start: (-?[\d.]+)/.exec(line);
    if (start?.[1]) open = Math.max(0, Number(start[1]));
    const end = /silence_end: ([\d.]+)/.exec(line);
    if (end?.[1] && open !== null) {
      gaps.push({ start: open, end: Number(end[1]) });
      open = null;
    }
  }
  // A break at the very end of the file has no `silence_end`.
  if (open !== null) gaps.push({ start: open, end: totalS });

  return { totalS, gaps };
}

/**
 * Reduces detected gaps to the chapter breaks.
 *
 * A narrator's own breath, or a long full stop, can trip the detector, so the
 * gaps are not assumed to be the breaks. The ones closest in length to the
 * configured break are kept, and only as many as there are boundaries. If that
 * still does not add up the script says so and changes nothing — silently
 * guessing which nine of eleven gaps were meant would be worse than stopping.
 */
function selectBreaks(gaps: Gap[], expected: number): Gap[] {
  if (gaps.length === expected) return gaps;

  const target = NARRATION_BREAK_MS / 1000;
  const ranked = [...gaps]
    .map((gap) => ({ gap, error: Math.abs(gap.end - gap.start - target) }))
    .sort((a, b) => a.error - b.error)
    .slice(0, expected)
    .map((entry) => entry.gap)
    .sort((a, b) => a.start - b.start);

  return ranked;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const audioPath = args.find((arg) => !arg.startsWith("--"));

  if (!audioPath) {
    console.error(
      "Usage: tsx scripts/sync-narration.ts <audio-file> [--write]\n\n" +
        "  Measures a recorded narration and reports how far each chapter is\n" +
        "  from its budgeted length. With --write, corrects the timings in\n" +
        "  src/components/demo/script.ts to match the recording.",
    );
    process.exit(1);
  }

  const { totalS, gaps } = await measure(audioPath);
  console.log(
    `[sync] ${audioPath}: ${formatTimecode(totalS * 1000)}, ` +
      `${gaps.length} gap${gaps.length === 1 ? "" : "s"} of ${MIN_SILENCE_S.toFixed(1)}s or more`,
  );

  // One break per chapter, the last of which may run to the end of the file.
  const breaks = selectBreaks(gaps, SCENES.length);

  if (breaks.length < SCENES.length - 1) {
    console.error(
      `\n[sync] Found ${breaks.length} usable breaks but the script has ` +
        `${SCENES.length} chapters, so the boundaries cannot be placed.\n` +
        `       Nothing was changed.\n\n` +
        `       The likely cause is that the <break> tags were removed from the\n` +
        `       text before it was rendered, or replaced with something the\n` +
        `       engine did not honour. docs/NARRATION.md has the tags in place.`,
    );
    process.exit(1);
  }

  /*
    Two measurements per chapter, and they are used for different things.

    `speech` is where the narrator talks: from the end of the previous gap to
    the start of the next. It is only reported, so a delivery faster than the
    copy was written for can be seen.

    `total` is the whole chapter including the gap that follows it, and it is
    what the timeline needs. Not speech plus a nominal two seconds: a rendered
    `<break time="2s" />` is not two seconds. In this recording the ten came
    back between 2.06 and 2.37, and treating them as exact walks the picture
    off the voice by a third of a second per chapter.
  */
  const speech: number[] = [];
  const total: number[] = [];
  let cursor = 0;
  for (let index = 0; index < SCENES.length; index += 1) {
    const gap = breaks[index];
    const speechEnd = gap ? gap.start : totalS;
    const sceneEnd = gap ? gap.end : totalS;
    speech.push(Math.max(0, Math.round((speechEnd - cursor) * 1000)));
    total.push(Math.max(0, Math.round((sceneEnd - cursor) * 1000)));
    cursor = sceneEnd;
  }

  console.log("\nchapter                     budget  spoken    drift   scene   wps");
  let rushed = 0;
  speech.forEach((ms, index) => {
    const scene = SCENES[index];
    if (!scene) return;
    const delta = ms - scene.speechMs;
    const wps = narrationWordCount(scene) / (ms / 1000);
    if (wps > SPOKEN_WPS_MAX) rushed += 1;
    console.log(
      `${index + 1}. ${scene.chapter}`.padEnd(28) +
        `${(scene.speechMs / 1000).toFixed(1)}s`.padStart(6) +
        `${(ms / 1000).toFixed(1)}s`.padStart(8) +
        `${delta >= 0 ? "+" : ""}${(delta / 1000).toFixed(1)}s`.padStart(9) +
        `${((total[index] ?? 0) / 1000).toFixed(1)}s`.padStart(8) +
        wps.toFixed(2).padStart(6) +
        (wps > SPOKEN_WPS_MAX ? "  fast" : ""),
    );
  });

  const cumulative =
    speech.reduce((a, b) => a + b, 0) - SCENES.reduce((a, s) => a + s.speechMs, 0);
  console.log(
    `\n[sync] runtime ${formatTimecode(total.reduce((a, b) => a + b, 0))}, ` +
      `speech ${cumulative >= 0 ? "+" : ""}${(cumulative / 1000).toFixed(1)}s against budget`,
  );

  if (rushed > 0) {
    /*
      Worth saying rather than silently accepting. The budget is the rate at
      which this copy can be delivered without sounding pressed; a recording
      above it is not a timing problem to be absorbed, it is a performance
      that will read as hurried on a product whose argument is that it is
      careful. Syncing to it is still correct — the picture must follow the
      voice that exists — but the voice is worth another take.
    */
    console.log(
      `[sync] ${rushed} of ${SCENES.length} chapters are read above ${SPOKEN_WPS_MAX} words/sec.\n` +
        "       The timings below will match this recording exactly, but the\n" +
        "       delivery is faster than the script was written for. If the tool\n" +
        "       offers a speaking-rate or speed control, a slower take will sound\n" +
        "       closer to what the copy intends.",
    );
  }

  if (!write) {
    console.log(
      "\n[sync] Read-only. Re-run with --write to correct the timings, then:\n" +
        "         npm run narration            # regenerate the recording script\n" +
        "         npm run record:walkthrough   # re-record, and mux the audio in",
    );
    return;
  }

  /*
    Written into its own module rather than back over the script's numbers.

    `script.ts` holds what the copy was written for; this holds what a voice
    did. Overwriting the former with the latter would let a rushed recording
    redefine "unhurried" as whatever it happened to be, and the speaking-rate
    check would then be validating the script against itself.
  */
  const header = await readFile(TIMINGS_PATH, "utf8").then(
    (existing) => existing.slice(0, existing.indexOf("/** Total scene duration")),
    () => "",
  );

  if (!header) {
    throw new Error(
      `${TIMINGS_PATH} is missing its documentation header, so it was not\n` +
        "  rewritten. Restore the file from git and run this again.",
    );
  }

  const body =
    "/** Total scene duration in milliseconds, keyed by scene id. */\n" +
    "export const MEASURED_SCENE_MS: Readonly<Record<string, number>> = {\n" +
    SCENES.map((scene, index) => `  ${scene.id}: ${total[index]},`).join("\n") +
    "\n};\n\n" +
    "/**\n" +
    " * How long the narrator actually speaks in each scene, excluding the pause.\n" +
    " *\n" +
    " * Not what the timeline runs on — the totals above are. This is here so the\n" +
    " * recording script can state the real speech-to-silence split rather than\n" +
    " * inferring it from the budget, and so a delivery faster than the copy was\n" +
    " * written for is a recorded fact and not just a line of console output that\n" +
    " * scrolled past once.\n" +
    " */\n" +
    "export const MEASURED_SPEECH_MS: Readonly<Record<string, number>> = {\n" +
    SCENES.map((scene, index) => `  ${scene.id}: ${speech[index]},`).join("\n") +
    "\n};\n\n" +
    "/** The recording these came from, for the record. */\n" +
    `export const MEASURED_SOURCE = ${JSON.stringify(basename(audioPath))};\n`;

  await writeFile(TIMINGS_PATH, header + body, "utf8");
  console.log(
    `\n[sync] wrote ${SCENES.length} measured scene timings to\n` +
      "         src/components/demo/timings.ts\n" +
      "[sync] now run:\n" +
      "         npm run narration            # regenerate the recording script\n" +
      "         npm run record:walkthrough   # re-record, and mux the audio in",
  );
}

main().catch((error) => {
  console.error(`[sync] failed\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
