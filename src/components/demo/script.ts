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

import { MEASURED_SCENE_MS, MEASURED_SPEECH_MS } from "./timings";

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
   * technology — one source, deliberately. Budgeted against `speechMs`; see
   * the speaking-rate note above.
   */
  narration: string;
  /**
   * How long the narrator is speaking for — *not* how long the scene is on
   * screen. `sceneDurationMs` adds the pause that follows.
   *
   * The distinction is load-bearing in two directions. A rate computed against
   * the on-screen time would count the silence as speaking time and report the
   * copy as more leisurely than it is, quietly licensing longer lines. And a
   * timeline built from speech alone would run ahead of the audio by the total
   * of every pause — twenty seconds by the end, which is a caption describing
   * the wrong picture for most of the second half.
   */
  speechMs: number;
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

/**
 * The pause held at the end of every chapter.
 *
 * Emitted into the recording script as an ElevenLabs `<break time="2s" />` tag
 * and added to each scene's on-screen time, so the two stay equal. This is the
 * single number that has to agree between the audio and the picture: change it
 * here, regenerate `docs/NARRATION.md`, and re-record — changing it in the
 * pasted script alone is what puts a narration twenty seconds adrift of the
 * visuals it describes.
 *
 * Two seconds is generous — a tenth of the total runtime is silence — and it is
 * a deliberate choice rather than a default. A chapter here ends on a claim
 * about what happens to a family's report, and running the next sentence onto
 * the end of it makes a list out of what should read as a sequence of
 * decisions. The cost is that the piece runs to 2:45 rather than 2:25.
 */
export const NARRATION_BREAK_MS = 2_000;

/**
 * The recorded narration, as the browser requests it.
 *
 * One constant for one file, because three things have to agree about it: the
 * player fetches it, the recorder muxes it into the exported video, and
 * `sync-narration` measures it to produce the timings in `timings.ts`. If any
 * of the three pointed somewhere else, the timeline would be cut to a different
 * recording from the one playing, and the symptom would be a caption that is
 * subtly early — the hardest kind of wrong to notice.
 *
 * It lives in `public/`, so it is committed. That is a different judgement from
 * the exported video, which is not: this is a source asset that changes only
 * when the narration is re-recorded, whereas the video is a build product that
 * changes wholesale on any visual edit.
 */
export const NARRATION_AUDIO_SRC = "/walkthrough-narration.mp3";

/**
 * The music bed the site serves, and who wrote it.
 *
 * Prepared by `scripts/make-web-music.ts` from the source track: trimmed to the
 * walkthrough's length, levelled, and normalised so the player's volume numbers
 * mean something regardless of what the source was.
 *
 * The credit is here rather than written into a component because the two have
 * to change together. A swapped track with the previous composer's name still
 * on screen is a worse outcome than no credit at all, and keeping them adjacent
 * is the only arrangement where that is hard to get wrong.
 *
 * Attribution is not optional to establish. Freely-downloadable music is
 * frequently Creative Commons with credit required, and serving the file from
 * `public/` means it reaches every visitor who presses play. The licence has to
 * be verified on the page the track came from — nothing here can do that.
 */
export const SITE_MUSIC_SRC = "/walkthrough-music.mp3";
export const SITE_MUSIC_CREDIT = { title: "Find", artist: "Hotham", source: "chosic.com" };

/**
 * How loud the bed plays, as a fraction of the file's own level.
 *
 * A browser has no sidechain compressor, so the ducking the exported video gets
 * from ffmpeg is done here instead — by easing between two volumes depending on
 * whether the narrator is speaking. The scene timings already record where each
 * line stops, so the player knows which of the two applies without listening to
 * anything.
 *
 * The file is normalised to -18 LUFS, so 0.16 lands near -34 LUFS against a
 * narration at -20.3: about fourteen decibels under the voice. In the gaps it
 * comes up to roughly nine decibels under, which is audible without being an
 * event.
 */
export const MUSIC_VOLUME_UNDER_SPEECH = 0.16;
export const MUSIC_VOLUME_IN_GAP = 0.28;

export const SCENES: readonly Scene[] = [
  {
    id: "arrive",
    chapter: "Someone needs help",
    caption: "A family member is missing. Somebody looks for a place to report it.",
    narration:
      "A relative is missing. Someone needs a place to report it. Locora is a public register of two kinds of report, and a careful way to connect them.",
    speechMs: 11000,
  },
  {
    id: "purpose",
    chapter: "Two kinds of report",
    caption: "Locora holds missing-person reports, and found-person reports.",
    narration:
      "There are two kinds. A missing-person report, filed by someone who is searching. And a found-person report, filed by someone who has found a person that cannot say who they are. They are filed separately, by people who have never met.",
    speechMs: 16000,
  },
  {
    id: "file",
    chapter: "Filing a report",
    caption: "Filing takes about five minutes. Only the name is essential.",
    narration:
      "Filing a missing-person report takes about five minutes. Only the person's name is essential. Anything the reporter is unsure of can be left blank, and a reviewer can come back to them.",
    speechMs: 12500,
  },
  {
    id: "details",
    chapter: "Details and photographs",
    caption: "A photograph does more than every other field combined.",
    narration:
      "Then the details, and photographs. A recent, clear photograph of a face does more than every other field combined, because the point of the public feed is that a stranger might recognise it. Contact details are collected here, and never published.",
    speechMs: 16000,
  },
  {
    id: "queue",
    chapter: "Into the queue",
    caption: "Nothing is published automatically. The report enters a queue.",
    narration:
      "The report is not published now. It goes into a review queue. Nothing on Locora reaches the public feed automatically.",
    speechMs: 8500,
  },
  {
    id: "review",
    chapter: "A person reviews it",
    caption: "A reviewer publishes it, asks for more, or declines with a reason.",
    narration:
      "A reviewer reads it and decides. They can publish it, mark it as being checked, or decline it. Declining requires a written reason, which the reporter is shown in full. Every action is recorded against the reviewer's account.",
    speechMs: 15000,
  },
  {
    id: "found",
    chapter: "The other side",
    caption: "Elsewhere, somebody reports a person they have found.",
    narration:
      "Elsewhere, knowing nothing of the first report, someone files a found-person report. There is no name to give, so they record an age range and a description. Where that person is now is collected, and never published.",
    speechMs: 14500,
  },
  {
    id: "match",
    chapter: "Looking for a match",
    caption: "Locora ranks candidates. A reviewer decides.",
    narration:
      "Locora ranks found reports against a missing case using things that can be checked. Whether the ages overlap. Whether the city matches. Whether the timing is possible. Every reason is shown. It is a shortlist, not a verdict, and a reviewer reads both cases in full before linking anything.",
    speechMs: 19000,
  },
  {
    id: "notify",
    chapter: "Both families are told",
    caption: "A link is a possibility, and both reporters are told exactly that.",
    narration:
      "When a link is made, both reporters are told straight away, and told plainly that nothing is confirmed. No software confirms a match on Locora. A false match here is not a poor recommendation. It is a family being told something untrue.",
    speechMs: 16500,
  },
  {
    id: "resolve",
    chapter: "The case closes",
    caption: "Confirmed, both cases close and leave the public feed.",
    narration:
      "If a reviewer establishes it is the same person, both cases close, leave the public feed, and the photographs are deleted. If it is not, both return to the feed, and both reporters are told it was ruled out.",
    speechMs: 15500,
  },
] as const;

/**
 * How long a scene is on screen: the narrator's line, then the pause after it.
 *
 * Derived rather than stored. Storing both invites the pair to disagree, and a
 * disagreement here is not a cosmetic bug — it is the caption describing the
 * previous chapter's picture.
 */
export function sceneDurationMs(scene: Scene): number {
  // The measurement wins when there is one. A recording is a fact about how
  // long the chapter takes; the budget is only a forecast of it, and a caption
  // has to follow the voice rather than the plan.
  return MEASURED_SCENE_MS[scene.id] ?? scene.speechMs + NARRATION_BREAK_MS;
}

/** Whether the timeline is following a real recording or its own budget. */
export const IS_TIMED_TO_RECORDING = SCENES.every(
  (scene) => MEASURED_SCENE_MS[scene.id] !== undefined,
);

/** Total speaking time, which is what the 90–150 second brief is about. */
export const TOTAL_SPEECH_MS = SCENES.reduce((total, scene) => total + scene.speechMs, 0);

/** Total runtime, speech plus every pause. What the player and the video run for. */
export const TOTAL_DURATION_MS = SCENES.reduce(
  (total, scene) => total + sceneDurationMs(scene),
  0,
);

/** The millisecond offset at which a scene begins, for the scrubber and seeking. */
export function sceneStartMs(index: number): number {
  return SCENES.slice(0, index).reduce((total, scene) => total + sceneDurationMs(scene), 0);
}

/** Which scene is playing at a given offset, clamped to the last one at the end. */
export function sceneIndexAt(elapsedMs: number): number {
  let accumulated = 0;
  for (let index = 0; index < SCENES.length; index += 1) {
    const scene = SCENES[index];
    accumulated += scene ? sceneDurationMs(scene) : 0;
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

/**
 * The rate a narrator would have to sustain to fit this scene's spoken part.
 *
 * Against `speechMs`, never the on-screen time. Dividing by the latter would
 * fold the pause into the denominator and report a comfortable rate for copy
 * that is in fact too dense — the error would make every line look more
 * relaxed than it reads, which is exactly the mistake this budget exists to
 * catch.
 */
export function narrationRateWps(scene: Scene): number {
  return narrationWordCount(scene) / (scene.speechMs / 1000);
}

/**
 * Whether the narrator is speaking at a given offset, or in the pause after a
 * line.
 *
 * This is what stands in for a sidechain key in the browser. Where a recording
 * has been measured the real speech length is used; otherwise the budget is the
 * best available guess, and being wrong by a fraction of a second only moves a
 * volume ramp slightly early or late.
 */
export function isSpeakingAt(elapsedMs: number): boolean {
  const index = sceneIndexAt(elapsedMs);
  const scene = SCENES[index];
  if (!scene) return false;

  const into = elapsedMs - sceneStartMs(index);
  return into < (MEASURED_SPEECH_MS[scene.id] ?? scene.speechMs);
}

/** Total words a narrator speaks across the whole walkthrough. */
export const TOTAL_NARRATION_WORDS = SCENES.reduce(
  (total, scene) => total + narrationWordCount(scene),
  0,
);
