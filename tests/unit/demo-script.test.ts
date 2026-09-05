/**
 * @vitest-environment node
 *
 * Pure timing arithmetic; no DOM involved.
 */
import { describe, expect, it } from "vitest";

import { MEASURED_SCENE_MS, MEASURED_SPEECH_MS } from "@/components/demo/timings";

import {
  formatTimecode,
  IS_TIMED_TO_RECORDING,
  NARRATION_BREAK_MS,
  narrationRateWps,
  narrationWordCount,
  SCENES,
  sceneDurationMs,
  sceneIndexAt,
  sceneStartMs,
  SPOKEN_WPS_MAX,
  SPOKEN_WPS_MIN,
  TOTAL_DURATION_MS,
  TOTAL_NARRATION_WORDS,
  TOTAL_SPEECH_MS,
} from "@/components/demo/script";

/**
 * The walkthrough's script and timeline.
 *
 * Two kinds of assertion here. The arithmetic ones matter because a wrong
 * offset desynchronises the caption from the visual, which on a two-minute
 * runtime is not something a casual look would catch. The content ones matter
 * because this script is the product's claim about itself, and the constraints
 * on it — no invented statistics, no real people, an honest runtime — are
 * exactly the kind of thing that erodes one edit at a time.
 */

describe("the walkthrough's shape", () => {
  it("runs comfortably inside the three-minute ceiling", () => {
    // The brief caps this at three minutes. A demo that quietly grew past that
    // would be one nobody finishes.
    expect(TOTAL_DURATION_MS).toBeLessThanOrEqual(180_000);
    expect(TOTAL_DURATION_MS).toBeGreaterThanOrEqual(90_000);
  });

  it("holds every scene for its line and the pause after it", () => {
    /*
      The property the audio depends on: a scene is on screen for the whole
      chapter, not just the speaking part. Were it the speech alone, the picture
      would run ahead of the recording by one pause per chapter — around twenty
      seconds by the end, which is most of the second half captioned against the
      wrong scene.

      Two sources satisfy that, and which one is in use matters. A measured
      recording is authoritative, because a rendered `<break time="2s" />` is
      not two seconds and the accumulated difference is what actually drifts.
      Without one, the budget plus the nominal break is the best available
      guess and is what the walkthrough runs on.
    */
    for (const scene of SCENES) {
      const measured = MEASURED_SCENE_MS[scene.id];
      expect(sceneDurationMs(scene), scene.id).toBe(
        measured ?? scene.speechMs + NARRATION_BREAK_MS,
      );

      /*
        A scene must outlast its own speech, compared against the same source
        throughout.

        Getting this wrong is instructive: comparing the *measured* total to the
        *budgeted* speech fails on "arrive", which the voice read in 8.6s and
        which then paused 2.3s — 10.9s in total, and so shorter than the 11s the
        line was budgeted to take. Nothing is broken there; the two numbers
        simply answer different questions, and mixing them produces a
        contradiction that looks like a bug in the data.
      */
      const speech = MEASURED_SPEECH_MS[scene.id] ?? scene.speechMs;
      expect(sceneDurationMs(scene), scene.id).toBeGreaterThan(speech);
    }
  });

  it("agrees with the recording it is timed against", () => {
    // Only meaningful once a narration has been measured. Skipped rather than
    // asserted-as-absent, so this suite stays honest on a checkout where no
    // audio has been produced.
    if (!IS_TIMED_TO_RECORDING) return;

    expect(Object.keys(MEASURED_SCENE_MS).sort()).toEqual(
      SCENES.map((scene) => scene.id).sort(),
    );
    expect(TOTAL_DURATION_MS).toBe(
      SCENES.reduce((total, scene) => total + (MEASURED_SCENE_MS[scene.id] ?? 0), 0),
    );
    // A measured pause should still resemble the tag that produced it. Far off
    // in either direction means the gaps found were not the breaks, which is
    // the failure mode that would silently mistime everything downstream.
    for (const scene of SCENES) {
      const pause = (MEASURED_SCENE_MS[scene.id] ?? 0) - (MEASURED_SPEECH_MS[scene.id] ?? 0);
      expect(pause, `${scene.id} pause`).toBeGreaterThan(NARRATION_BREAK_MS * 0.5);
      expect(pause, `${scene.id} pause`).toBeLessThan(NARRATION_BREAK_MS * 2);
    }
  });

  it("covers the ten beats the product story needs", () => {
    expect(SCENES.map((scene) => scene.id)).toEqual([
      "arrive",
      "purpose",
      "file",
      "details",
      "queue",
      "review",
      "found",
      "match",
      "notify",
      "resolve",
    ]);
  });

  it("gives every scene a caption, a narration and a chapter name", () => {
    for (const scene of SCENES) {
      expect(scene.chapter.length, scene.id).toBeGreaterThan(0);
      expect(scene.caption.length, scene.id).toBeGreaterThan(0);
      // The narration is the transcript entry and carries the substance, so it
      // should say more than the one-line caption over the visual.
      expect(scene.narration.length, scene.id).toBeGreaterThan(scene.caption.length);
    }
  });

  it("gives every scene long enough to read its caption", () => {
    for (const scene of SCENES) {
      // Roughly 200ms per word plus a beat. A caption that leaves before it can
      // be read is worse than no caption.
      const words = scene.caption.split(/\s+/).length;
      // Against on-screen time, not speaking time: the caption stays up through
      // the pause, and that pause is reading time like any other.
      expect(
        sceneDurationMs(scene),
        `${scene.id} is too short for its caption`,
      ).toBeGreaterThanOrEqual(words * 200);
    }
  });

  it("spends the most time on the two beats that carry the argument", () => {
    // That a person reviews everything, and that a match is a possibility
    // rather than a verdict. If a mechanical step ever outruns these, the
    // walkthrough has drifted into describing features instead of the product.
    // Speaking time, since the pause is the same for every scene and would
    // only add a constant to both sides.
    const byId = new Map(SCENES.map((scene) => [scene.id, scene.speechMs]));
    const mechanical = ["arrive", "queue", "file"] as const;

    for (const id of mechanical) {
      expect(byId.get("match")!, `match should outlast ${id}`).toBeGreaterThan(byId.get(id)!);
      expect(byId.get("notify")!, `notify should outlast ${id}`).toBeGreaterThan(byId.get(id)!);
    }
  });
});

/**
 * The narration has to be speakable.
 *
 * This is the constraint that is easiest to break without noticing, because
 * nothing about reading a sentence on screen reveals that it cannot be said
 * aloud in the time available. An earlier revision of this script averaged 193
 * words per minute and peaked at 220 — perfectly good prose that no narrator
 * could have delivered without sounding hurried, on a product whose entire
 * argument is that it is careful.
 *
 * So the budget is enforced here rather than left as a note in a document. A
 * future edit that lengthens a line without lengthening its scene fails, and
 * the failure names the scene and the rate it would demand.
 */
describe("the narration can actually be spoken", () => {
  it("keeps every scene inside the speaking-rate band", () => {
    for (const scene of SCENES) {
      const rate = narrationRateWps(scene);
      const words = narrationWordCount(scene);
      const seconds = scene.speechMs / 1000;

      expect(
        rate,
        `"${scene.id}" needs ${rate.toFixed(2)} words/sec (${words} words in ${seconds}s). ` +
          `Shorten the narration or lengthen the scene.`,
      ).toBeLessThanOrEqual(SPOKEN_WPS_MAX);

      expect(
        rate,
        `"${scene.id}" runs at only ${rate.toFixed(2)} words/sec, which will sound laboured.`,
      ).toBeGreaterThanOrEqual(SPOKEN_WPS_MIN);
    }
  });

  it("checks each scene rather than the average", () => {
    // Guarding this property explicitly, because the obvious way to write the
    // test above is against the whole script — and an average is exactly what
    // hides one dense scene sitting between two sparse ones, which is the case
    // a narrator cannot deliver.
    const overall = TOTAL_NARRATION_WORDS / (TOTAL_SPEECH_MS / 1000);
    expect(overall).toBeLessThanOrEqual(SPOKEN_WPS_MAX);
    expect(SCENES.every((scene) => narrationRateWps(scene) <= SPOKEN_WPS_MAX)).toBe(true);
  });

  it("fits the runtime a voiceover is briefed for", () => {
    // 90–150 seconds, measured as speech. The brief's window is about how long
    // somebody is being spoken to; the pauses between chapters are the picture's
    // business and are counted by TOTAL_DURATION_MS instead.
    expect(TOTAL_SPEECH_MS).toBeGreaterThanOrEqual(90_000);
    expect(TOTAL_SPEECH_MS).toBeLessThanOrEqual(150_000);
  });

  it("counts a hyphenated compound as the one word a narrator says", () => {
    // "missing-person report" is three beats, not four. If this ever splits on
    // punctuation the budget silently tightens and every scene fails at once.
    const purpose = SCENES.find((scene) => scene.id === "purpose");
    expect(purpose?.narration).toContain("missing-person");
    expect(narrationWordCount({ ...purpose!, narration: "a missing-person report" })).toBe(3);
  });
});

describe("the script makes no claims it cannot support", () => {
  const allText = SCENES.map((scene) => `${scene.caption} ${scene.narration}`).join(" ");

  it("contains no statistics", () => {
    // Any bare number over two digits in this copy would be a count, a
    // percentage or a date — none of which Locora has anything real to say.
    expect(allText).not.toMatch(/\b\d{3,}\b/);
    expect(allText).not.toMatch(/\d+\s*%/);
  });

  it("names no organisation, partnership or endorsement", () => {
    for (const word of ["partner", "certified", "accredited", "trusted by", "police force", "charity"]) {
      expect(allText.toLowerCase(), `script mentions "${word}"`).not.toContain(word);
    }
  });

  it("says plainly that a person decides, and that a match is not a verdict", () => {
    // The two claims the product's credibility rests on. If either disappears
    // from the script, the walkthrough is describing a different product.
    expect(allText.toLowerCase()).toContain("nothing on locora reaches the public feed automatically");
    expect(allText.toLowerCase()).toContain("no software confirms a match");
  });
});

describe("scene offsets", () => {
  it("starts the first scene at zero", () => {
    expect(sceneStartMs(0)).toBe(0);
  });

  it("makes each scene start where the previous one ended", () => {
    for (let index = 1; index < SCENES.length; index += 1) {
      expect(sceneStartMs(index)).toBe(
        sceneStartMs(index - 1) + sceneDurationMs(SCENES[index - 1]!),
      );
    }
  });

  it("ends the last scene exactly at the total duration", () => {
    const last = SCENES.length - 1;
    expect(sceneStartMs(last) + sceneDurationMs(SCENES[last]!)).toBe(TOTAL_DURATION_MS);
  });
});

describe("sceneIndexAt", () => {
  it("resolves the first scene at the start", () => {
    expect(sceneIndexAt(0)).toBe(0);
    expect(sceneIndexAt(1)).toBe(0);
  });

  it("resolves each scene at its own start offset", () => {
    // The property the scrubber depends on: seeking to a chapter's start must
    // land in that chapter and not a frame short of it.
    for (let index = 0; index < SCENES.length; index += 1) {
      expect(sceneIndexAt(sceneStartMs(index)), `scene ${index}`).toBe(index);
    }
  });

  it("resolves the last millisecond of a scene to that scene, not the next", () => {
    for (let index = 0; index < SCENES.length; index += 1) {
      const end = sceneStartMs(index) + sceneDurationMs(SCENES[index]!);
      expect(sceneIndexAt(end - 1), `end of scene ${index}`).toBe(index);
    }
  });

  it("clamps at the end rather than running off the array", () => {
    // The playhead reaches exactly TOTAL_DURATION_MS when playback finishes,
    // and an unclamped lookup there would return undefined and blank the stage.
    expect(sceneIndexAt(TOTAL_DURATION_MS)).toBe(SCENES.length - 1);
    expect(sceneIndexAt(TOTAL_DURATION_MS + 10_000)).toBe(SCENES.length - 1);
  });
});

describe("formatTimecode", () => {
  it("renders minutes and zero-padded seconds", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(9_000)).toBe("0:09");
    expect(formatTimecode(65_000)).toBe("1:05");
    expect(formatTimecode(600_000)).toBe("10:00");
  });

  it("never renders a negative time", () => {
    // Clock skew or a rounding error must not produce "-1:-5" in the transport.
    expect(formatTimecode(-5_000)).toBe("0:00");
  });
});
