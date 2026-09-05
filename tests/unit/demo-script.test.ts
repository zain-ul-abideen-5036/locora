/**
 * @vitest-environment node
 *
 * Pure timing arithmetic; no DOM involved.
 */
import { describe, expect, it } from "vitest";

import {
  formatTimecode,
  SCENES,
  sceneIndexAt,
  sceneStartMs,
  TOTAL_DURATION_MS,
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
    // The brief caps this at three minutes and targets 90–150 seconds. A demo
    // that quietly grew past that would be one nobody finishes.
    expect(TOTAL_DURATION_MS).toBeLessThanOrEqual(180_000);
    expect(TOTAL_DURATION_MS).toBeGreaterThanOrEqual(90_000);
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
      expect(scene.durationMs, `${scene.id} is too short for its caption`).toBeGreaterThanOrEqual(
        words * 200,
      );
    }
  });

  it("spends the most time on the two beats that carry the argument", () => {
    // That a person reviews everything, and that a match is a possibility
    // rather than a verdict. If a mechanical step ever outruns these, the
    // walkthrough has drifted into describing features instead of the product.
    const byId = new Map(SCENES.map((scene) => [scene.id, scene.durationMs]));
    const mechanical = ["arrive", "queue", "file"] as const;

    for (const id of mechanical) {
      expect(byId.get("match")!, `match should outlast ${id}`).toBeGreaterThan(byId.get(id)!);
      expect(byId.get("notify")!, `notify should outlast ${id}`).toBeGreaterThan(byId.get(id)!);
    }
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
        sceneStartMs(index - 1) + (SCENES[index - 1]?.durationMs ?? 0),
      );
    }
  });

  it("ends the last scene exactly at the total duration", () => {
    const last = SCENES.length - 1;
    expect(sceneStartMs(last) + (SCENES[last]?.durationMs ?? 0)).toBe(TOTAL_DURATION_MS);
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
      const end = sceneStartMs(index) + (SCENES[index]?.durationMs ?? 0);
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
