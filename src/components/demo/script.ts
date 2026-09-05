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
 * ## Timing
 *
 * Durations are in milliseconds and total a little under two minutes, which the
 * brief targets. They are deliberately uneven: the two beats that carry the
 * product's actual argument — that a person reviews everything, and that a match
 * is a possibility rather than a verdict — are given longer than the mechanical
 * steps around them.
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
  /** The longer form, used by the transcript and by assistive technology. */
  narration: string;
  durationMs: number;
}

export const SCENES: readonly Scene[] = [
  {
    id: "arrive",
    chapter: "Someone needs help",
    caption: "A family member is missing. Somebody looks for a place to report it.",
    narration:
      "Somebody's relative is missing and they are looking for somewhere to report it. Locora is a public register of two kinds of report, and a careful process for connecting them.",
    durationMs: 9000,
  },
  {
    id: "purpose",
    chapter: "Two kinds of report",
    caption: "Locora holds missing-person reports, and found-person reports.",
    narration:
      "Locora holds two kinds of report. A missing-person report, filed by somebody searching. And a found-person report, filed by somebody who has found a person who cannot say who they are. The two are filed independently, by people who have never met.",
    durationMs: 12000,
  },
  {
    id: "file",
    chapter: "Filing a report",
    caption: "Filing takes about five minutes. Only the name is essential.",
    narration:
      "Filing a missing-person report takes about five minutes. Only the person's name is essential — anything the reporter is unsure of can be left blank, and a reviewer can come back to them.",
    durationMs: 11000,
  },
  {
    id: "details",
    chapter: "Details and photographs",
    caption: "A photograph does more than every other field combined.",
    narration:
      "Details and photographs are added. A recent, clear photograph of a face does more than every other field combined, because the whole point of the public feed is that a stranger might recognise it. Contact details are collected here too — and never published.",
    durationMs: 12000,
  },
  {
    id: "queue",
    chapter: "Into the queue",
    caption: "Nothing is published automatically. The report enters a queue.",
    narration:
      "The report is not published at this point. It goes into a review queue. Nothing on Locora reaches the public feed automatically.",
    durationMs: 9000,
  },
  {
    id: "review",
    chapter: "A person reviews it",
    caption: "A reviewer publishes it, asks for more, or declines with a reason.",
    narration:
      "A reviewer reads the report and decides. They can publish it, mark it as being checked, or decline it — and declining requires them to write a reason, which the reporter is shown in full. Every one of those actions is recorded against the reviewer's account.",
    durationMs: 14000,
  },
  {
    id: "found",
    chapter: "The other side",
    caption: "Elsewhere, somebody reports a person they have found.",
    narration:
      "Elsewhere, and with no knowledge of the first report, somebody files a found-person report about a person they have found. There is no name to give, so they record an age range and a description. Where that person is now is collected, and never published.",
    durationMs: 13000,
  },
  {
    id: "match",
    chapter: "Looking for a match",
    caption: "Locora ranks candidates. A reviewer decides.",
    narration:
      "Locora ranks found-person reports against a missing case by things that can be checked: whether the age ranges overlap, whether the city is the same, whether the timing is possible. Every reason is shown. It is a shortlist, not a verdict — a reviewer reads both cases in full before linking anything.",
    durationMs: 16000,
  },
  {
    id: "notify",
    chapter: "Both families are told",
    caption: "A link is a possibility, and both reporters are told exactly that.",
    narration:
      "When a link is made, both reporters are told immediately — and told plainly that nothing is confirmed. No software confirms a match on Locora. A false match here is not a bad recommendation; it is a family being told something untrue.",
    durationMs: 15000,
  },
  {
    id: "resolve",
    chapter: "The case closes",
    caption: "Confirmed, both cases close and leave the public feed.",
    narration:
      "If a reviewer establishes it is the same person, both cases are marked resolved and removed from the public feed, and the photographs are deleted. If it is not the same person, both go back on the feed and both reporters are told it was ruled out.",
    durationMs: 14000,
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
