/**
 * The walkthrough script.
 *
 * Kept as data, apart from the player and the scenes that render it, for three
 * reasons: the wording is the part most likely to be revised by somebody who is
 * not editing components, it is the source the transcript is generated from
 * (so the two can never drift), and it is reviewable as prose in a diff.
 *
 * ## Every word here is true
 *
 * The narration describes only what the software actually does. There are no
 * statistics, no organisations, no success stories and no claims about outcomes.
 * The one case used throughout is explicitly fictional and labelled as such on
 * screen — a demo that showed a real missing person to illustrate a feature
 * would be the single worst thing this product could do.
 *
 * ## This is spoken copy, not prose
 *
 * `narration` is three things at once: the transcript, the text assistive
 * technology reads, and the script a voice artist records. That last one is a
 * hard constraint the first two do not impose, and it is the one that is easy
 * to break by accident.
 *
 * An earlier revision of this file read well and could not be spoken. It ran to
 * 403 words across 125 seconds — an average of 193 words per minute, with
 * individual scenes reaching 220. Nothing was wrong with the sentences; they
 * were simply written to be read by an eye that can go at its own pace. Handed
 * to a narrator, they would have had to be rushed, and "rushed" is the opposite
 * of every adjective this product wants a visitor to feel.
 *
 * So the copy is now budgeted. Every scene's word count is checked against its
 * duration by `tests/unit/demo-script.test.ts`, which fails if any scene drifts
 * outside the band below. The band is not a style preference — it is the range
 * inside which a person can be understood without sounding either hurried or
 * sedated.
 *
 * Deliberately, the transcript and the voiceover are the *same* text. Keeping
 * two versions would mean a deaf visitor reading a different account of the
 * product from the one a hearing visitor is told, which is precisely the split
 * captions exist to prevent.
 *
 * ## Timing
 *
 * Durations are in milliseconds. They are deliberately uneven: the two beats
 * that carry the product's actual argument — that a person reviews everything,
 * and that a match is a possibility rather than a verdict — are given longer
 * than the mechanical steps around them.
 *
 * Nothing should hard-code the total. `TOTAL_DURATION_MS` is derived, and the
 * landing page formats it rather than restating it in prose, so the runtime a
 * visitor is promised cannot fall out of step with the runtime they get.
 */

export type SceneId =
  | "arrive"
  | "purpose"
  | "file"
  | "details"
  | "queue"
  | "review"
  | "found"
  | "match"
  | "notify"
  | "resolve";

export interface Scene {
  id: SceneId;
  /** Shown as the chapter name in the scrubber and the transcript. */
  chapter: string;
  /** The line displayed as a caption while this scene plays. */
  caption: string;
  /**
   * The spoken line. Also the transcript entry and the text read by assistive
   * technology — one source, deliberately. Budgeted against `durationMs`; see
   * the speaking-rate note above.
   */
  narration: string;
  durationMs: number;
}

/**
 * The speaking-rate band, in words per second.
 *
 * Unhurried conversational English sits around 2.2–2.7 words per second, or
 * 130–160 words a minute. Below the floor a narrator sounds artificially slow,
 * which on a product about missing people reads as solemnity laid on with a
 * trowel. Above the ceiling they sound pressed, and a listener stops absorbing
 * and starts merely hearing.
 *
 * These are checked per scene rather than across the whole script, because an
 * average hides the case that matters: one dense scene between two sparse ones
 * is exactly the thing a narrator cannot deliver, and exactly the thing a total
 * would conceal.
 */
export const SPOKEN_WPS_MIN = 1.9;
export const SPOKEN_WPS_MAX = 2.75;

export const SCENES: readonly Scene[] = [
  {
    id: "arrive",
    chapter: "Someone needs help",
    caption: "A family member is missing. Somebody looks for a place to report it.",
    narration:
      "A relative is missing. Someone needs a place to report it. Locora is a public register of two kinds of report, and a careful way to connect them.",
    durationMs: 11000,
  },
  {
    id: "purpose",
    chapter: "Two kinds of report",
    caption: "Locora holds missing-person reports, and found-person reports.",
    narration:
      "There are two kinds. A missing-person report, filed by someone who is searching. And a found-person report, filed by someone who has found a person that cannot say who they are. They are filed separately, by people who have never met.",
    durationMs: 16000,
  },
  {
    id: "file",
    chapter: "Filing a report",
    caption: "Filing takes about five minutes. Only the name is essential.",
    narration:
      "Filing a missing-person report takes about five minutes. Only the person's name is essential. Anything the reporter is unsure of can be left blank, and a reviewer can come back to them.",
    durationMs: 12500,
  },
  {
    id: "details",
    chapter: "Details and photographs",
    caption: "A photograph does more than every other field combined.",
    narration:
      "Then the details, and photographs. A recent, clear photograph of a face does more than every other field combined, because the point of the public feed is that a stranger might recognise it. Contact details are collected here, and never published.",
    durationMs: 16000,
  },
  {
    id: "queue",
    chapter: "Into the queue",
    caption: "Nothing is published automatically. The report enters a queue.",
    narration:
      "The report is not published now. It goes into a review queue. Nothing on Locora reaches the public feed automatically.",
    durationMs: 8500,
  },
  {
    id: "review",
    chapter: "A person reviews it",
    caption: "A reviewer publishes it, asks for more, or declines with a reason.",
    narration:
      "A reviewer reads it and decides. They can publish it, mark it as being checked, or decline it. Declining requires a written reason, which the reporter is shown in full. Every action is recorded against the reviewer's account.",
    durationMs: 15000,
  },
  {
    id: "found",
    chapter: "The other side",
    caption: "Elsewhere, somebody reports a person they have found.",
    narration:
      "Elsewhere, knowing nothing of the first report, someone files a found-person report. There is no name to give, so they record an age range and a description. Where that person is now is collected, and never published.",
    durationMs: 14500,
  },
  {
    id: "match",
    chapter: "Looking for a match",
    caption: "Locora ranks candidates. A reviewer decides.",
    narration:
      "Locora ranks found reports against a missing case using things that can be checked. Whether the ages overlap. Whether the city matches. Whether the timing is possible. Every reason is shown. It is a shortlist, not a verdict, and a reviewer reads both cases in full before linking anything.",
    durationMs: 19000,
  },
  {
    id: "notify",
    chapter: "Both families are told",
    caption: "A link is a possibility, and both reporters are told exactly that.",
    narration:
      "When a link is made, both reporters are told straight away, and told plainly that nothing is confirmed. No software confirms a match on Locora. A false match here is not a poor recommendation. It is a family being told something untrue.",
    durationMs: 16500,
  },
  {
    id: "resolve",
    chapter: "The case closes",
    caption: "Confirmed, both cases close and leave the public feed.",
    narration:
      "If a reviewer establishes it is the same person, both cases close, leave the public feed, and the photographs are deleted. If it is not, both return to the feed, and both reporters are told it was ruled out.",
    durationMs: 15500,
  },
] as const;

export const TOTAL_DURATION_MS = SCENES.reduce((total, scene) => total + scene.durationMs, 0);

/** The millisecond offset at which a scene begins, for the scrubber and seeking. */
export function sceneStartMs(index: number): number {
  return SCENES.slice(0, index).reduce((total, scene) => total + scene.durationMs, 0);
}

/** Which scene is playing at a given offset, clamped to the last one at the end. */
export function sceneIndexAt(elapsedMs: number): number {
  let accumulated = 0;
  for (let index = 0; index < SCENES.length; index += 1) {
    accumulated += SCENES[index]?.durationMs ?? 0;
    if (elapsedMs < accumulated) return index;
  }
  return SCENES.length - 1;
}

/** `1:52`, for the transport controls. */
export function formatTimecode(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Words in a scene's narration.
 *
 * Hyphenated compounds count as one word because a narrator says them as one —
 * "missing-person report" is three beats, not four. Splitting on whitespace
 * alone gets this right; splitting on punctuation would not.
 */
export function narrationWordCount(scene: Scene): number {
  return scene.narration.trim().split(/\s+/).length;
}

/** The rate a narrator would have to sustain to fit this scene. */
export function narrationRateWps(scene: Scene): number {
  return narrationWordCount(scene) / (scene.durationMs / 1000);
}

/** Total words a narrator speaks across the whole walkthrough. */
export const TOTAL_NARRATION_WORDS = SCENES.reduce(
  (total, scene) => total + narrationWordCount(scene),
  0,
);
