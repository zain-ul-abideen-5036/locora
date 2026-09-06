"use client";

/**
 * The Locora walkthrough — a scripted animated explainer with the transport
 * controls of a video player.
 *
 * ## Why this is not a video file
 *
 * A screen recording of this interface would be several megabytes, resample
 * badly on a high-density display, be unreadable at phone width, carry no text
 * a screen reader or a search engine can use, and need re-recording every time
 * the UI changes. This is a few kilobytes of DOM, crisp at any size,
 * selectable, translatable, and it cannot go stale in the same way.
 *
 * It behaves like a player because that is the interaction people already know:
 * play and pause, a scrubber, chapters, elapsed time, captions, a full
 * transcript, and the recorded narration.
 *
 * ## Timing, and which clock wins
 *
 * Driven by `requestAnimationFrame` reading a clock each frame, rather than by
 * an interval counting ticks. An interval drifts whenever the tab is throttled
 * or a frame is slow, so the captions gradually desynchronise from the visuals
 * over a two-minute run.
 *
 * *Which* clock depends on whether the narration is audible. When it is, the
 * audio element's own position is the playhead — not a counter running beside
 * it. Two clocks drift against each other however carefully they are started,
 * and a per-cent of drift across two and a half minutes is a caption sitting on
 * the wrong chapter. One position cannot disagree with itself. With the sound
 * off, or where the browser refuses to play it, the frame delta takes over.
 *
 * The scene boundaries themselves are measured from that recording — see
 * `timings.ts` — so the picture is cut to the voice rather than to a forecast
 * of it.
 *
 * ## Sound is offered, never imposed
 *
 * The audio element is mounted only after somebody presses "Watch how Locora
 * works", so nothing can play before a deliberate gesture. That is not merely
 * browser policy: this is the landing page of a missing-person service, which
 * may be open in a waiting room or on a bus. The preference is remembered, so
 * a viewer who mutes it is not asked again.
 *
 * ## Reduced motion
 *
 * Somebody who has asked for less motion gets the storyboard: every scene laid
 * out and readable at once, with no playback at all. That is a better answer
 * than playing the same thing without transitions — the content is the point,
 * and this way they can read it at their own pace.
 */

import {
  ChevronRight,
  ListVideo,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "@/lib/use-reduced-motion";

import { DemoScene } from "./scenes";
import {
  formatTimecode,
  isSpeakingAt,
  MUSIC_VOLUME_IN_GAP,
  MUSIC_VOLUME_UNDER_SPEECH,
  NARRATION_AUDIO_SRC,
  SITE_MUSIC_CREDIT,
  SITE_MUSIC_SRC,
  SCENES,
  sceneDurationMs,
  sceneIndexAt,
  sceneStartMs,
  TOTAL_DURATION_MS,
} from "./script";

/**
 * Whether the viewer wants the narration audible, remembered between visits.
 *
 * Read straight out of `localStorage` during the first render, which is only
 * safe because this component is imported with `ssr: false` and therefore never
 * renders on the server — so there is no markup for a stored value to disagree
 * with. The `typeof window` guard is there in case that import ever changes.
 */
const SOUND_KEY = "locora:walkthrough-sound";

function readSoundPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    // Private browsing, or site data blocked. Defaulting to sound on matches
    // what somebody who just pressed a play button is expecting.
    return true;
  }
}

export function DemoPlayer({ autoStart = false }: { autoStart?: boolean }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(autoStart);
  const [finished, setFinished] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [soundOn, setSoundOn] = useState(readSoundPreference);
  /**
   * Set when the browser refuses to play the narration at all — a blocked
   * autoplay policy, a missing file, a codec it will not decode. The
   * walkthrough then runs silently on its own clock rather than stalling,
   * because a demonstration that plays is worth more than one that waits for
   * audio it is never going to get.
   */
  const [soundBroken, setSoundBroken] = useState(false);
  const reducedMotion = useReducedMotion();

  const frameRef = useRef<number | undefined>(undefined);
  const lastTickRef = useRef<number | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  /** The playhead, readable from an effect without making it a dependency. */
  const elapsedRef = useRef(0);

  useEffect(() => {
    elapsedRef.current = elapsedMs;
  }, [elapsedMs]);

  const audible = soundOn && !soundBroken && !reducedMotion;

  useEffect(() => {
    if (!playing || reducedMotion) return;

    function tick(now: number) {
      const previous = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const audio = audioRef.current;

      setElapsedMs((current) => {
        /*
          When the narration is audible it *is* the clock.

          Advancing a separate counter alongside it and hoping the two agree is
          the obvious approach and the wrong one: two clocks drift, and over two
          and a half minutes a drift of even a per-cent puts the caption on the
          wrong chapter. Reading the audio's own position cannot drift, because
          there is only one position.

          `readyState < 2` means the audio has not buffered enough to have a
          position yet, so the playhead holds rather than running ahead of a
          voice that has not started. That is what a video does while it
          buffers, and it is why the first frame can sit for a moment.
        */
        if (audible) {
          if (!audio || audio.readyState < 2) return current;
          if (audio.ended) {
            setPlaying(false);
            setFinished(true);
            return TOTAL_DURATION_MS;
          }
          const fromAudio = audio.currentTime * 1000;
          if (fromAudio >= TOTAL_DURATION_MS) {
            setPlaying(false);
            setFinished(true);
            return TOTAL_DURATION_MS;
          }
          return fromAudio;
        }

        // Clamped per frame. A backgrounded tab produces one enormous delta on
        // return, which would otherwise jump the playhead to the end.
        const delta = Math.min(now - previous, 250);
        const next = current + delta;

        if (next >= TOTAL_DURATION_MS) {
          setPlaying(false);
          setFinished(true);
          return TOTAL_DURATION_MS;
        }
        return next;
      });

      /*
        The bed's level, eased rather than switched.

        This is the browser's substitute for the sidechain compressor the
        exported video gets from ffmpeg: there is no such filter here, only a
        `volume` property, so the ducking is done by moving that toward one of
        two targets depending on whether the narrator is speaking.

        Eased at a few per cent a frame, which lands somewhere near a third of a
        second. Setting it outright would click, and a slower ramp would still
        be falling as the next line began.
      */
      const music = musicRef.current;
      if (music) {
        const target = isSpeakingAt(elapsedRef.current)
          ? MUSIC_VOLUME_UNDER_SPEECH
          : MUSIC_VOLUME_IN_GAP;
        const drift = target - music.volume;
        music.volume = Math.abs(drift) < 0.004 ? target : music.volume + drift * 0.08;
      }

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      // Cleared so resuming does not count the paused interval as elapsed time.
      lastTickRef.current = undefined;
    };
  }, [playing, reducedMotion, audible]);

  /**
   * Keeps the audio element following the transport.
   *
   * Deliberately not dependent on `elapsedMs` — it would then re-run sixty
   * times a second and fight the clock it is meant to follow. The playhead is
   * read from a ref, and only realigned when the two have actually parted
   * company, which happens after a seek or after playing on silently with the
   * sound off.
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audible || !playing) {
      audio.pause();
      return;
    }

    if (Math.abs(audio.currentTime * 1000 - elapsedRef.current) > 250) {
      audio.currentTime = elapsedRef.current / 1000;
    }

    void audio.play().catch(() => {
      // Asynchronous, so this is not a render-phase update. Falling back to the
      // silent clock is the only useful response.
      setSoundBroken(true);
    });
  }, [audible, playing]);

  /**
   * The music bed follows the narration, and is governed by the same switch.
   *
   * One control for both, deliberately. Two would be a mixing desk on a landing
   * page: somebody who does not want sound wants no sound, and somebody who
   * does is not looking to balance it themselves.
   *
   * Its failure is also treated differently from the narration's. If the bed
   * will not play, that is a bed missing from a walkthrough which otherwise
   * works perfectly, so it is allowed to fail quietly — whereas a narration
   * that will not play takes the timeline with it and has to fall back to the
   * frame clock.
   */
  useEffect(() => {
    const music = musicRef.current;
    if (!music) return;

    if (!audible || !playing) {
      music.pause();
      return;
    }

    if (Math.abs(music.currentTime * 1000 - elapsedRef.current) > 400) {
      music.currentTime = elapsedRef.current / 1000;
    }

    /*
      Placed at its target *before* playing, not eased into it.

      An `<audio>` element's volume defaults to 1. The frame loop below ramps
      toward the target rather than jumping, which is right for the speech and
      gap transitions and quite wrong for the first frame of playback: leaving
      it to the ramp meant the bed opened at full volume and took about half a
      second to come down. Measured at 0.76 shortly after play began, against a
      target of 0.16 — a bed several times louder than intended, arriving on top
      of the first line of narration.
    */
    music.volume = isSpeakingAt(elapsedRef.current)
      ? MUSIC_VOLUME_UNDER_SPEECH
      : MUSIC_VOLUME_IN_GAP;

    void music.play().catch(() => {});
  }, [audible, playing]);

  const activeIndex = sceneIndexAt(elapsedMs);
  const activeScene = SCENES[activeIndex];

  const seekToScene = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, SCENES.length - 1));
    const target = sceneStartMs(clamped);
    setElapsedMs(target);
    // Updated here as well as by its effect, so the audio-following effect sees
    // the new position immediately rather than one render late.
    elapsedRef.current = target;
    setFinished(false);

    const audio = audioRef.current;
    if (audio) audio.currentTime = target / 1000;
    const music = musicRef.current;
    if (music) music.currentTime = target / 1000;
  }, []);

  const toggle = useCallback(() => {
    if (finished) {
      setElapsedMs(0);
      elapsedRef.current = 0;
      setFinished(false);
      setPlaying(true);
      const audio = audioRef.current;
      if (audio) audio.currentTime = 0;
      const music = musicRef.current;
      if (music) music.currentTime = 0;
      return;
    }
    setPlaying((current) => !current);
  }, [finished]);

  const toggleSound = useCallback(() => {
    setSoundOn((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        // Not being able to remember the choice is no reason to ignore it.
      }
      return next;
    });
    // Turning the sound back on after it failed once is a fair request to try
    // again — the failure may have been a policy that no longer applies.
    setSoundBroken(false);
  }, []);

  /**
   * Keyboard control, scoped to the player.
   *
   * Space and the arrow keys are what anybody who has used a player expects.
   * Listening on the container rather than the document means the shortcuts
   * only apply when focus is inside the player — a page-level Space handler
   * would break scrolling everywhere else.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Let a button handle its own activation rather than doing it twice.
      if (event.target instanceof HTMLElement && event.target.tagName === "BUTTON") {
        if (event.key === " " || event.key === "Enter") return;
      }

      if (event.key === " " || event.key === "k") {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekToScene(activeIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekToScene(activeIndex - 1);
      }
    },
    [activeIndex, seekToScene, toggle],
  );

  if (reducedMotion) {
    return <Storyboard />;
  }

  return (
    <div
      onKeyDown={onKeyDown}
      // A group role with a name, so assistive technology announces this as one
      // composite widget rather than a pile of unrelated buttons.
      role="group"
      aria-label="How Locora works — an animated walkthrough"
      className="overflow-hidden rounded-2xl border border-line bg-canvas shadow-lg"
    >
      {/*
        Stage. A fixed aspect ratio so the surrounding layout never reflows as
        scenes of different heights come and go.

        4:3 on a phone, where scenes stack and need the height. 16:9 from sm up,
        where they sit side by side. Wider again from lg, because 16:9 is a
        ratio for photography rather than for these: measured at 1440px, the
        tallest scene was 225px inside a 503px stage and the shortest 150px, so
        between 280 and 350 pixels of every frame was empty. A demonstration
        that leaves two thirds of its own frame blank reads as unfinished
        whatever is in the other third.
      */}
      {/*
        Stage and caption share a positioning context, so the caption can sit
        beneath the stage on a phone and over it from `sm` up without existing
        twice. Two copies would be the obvious way to get both, and would give a
        screen reader two live regions announcing every caption change.
      */}
      <div className="relative">
        {/*
          A fixed height on a phone rather than a ratio.

          `aspect-4/3` is a floor, not a ceiling: a scene taller than the box
          simply grew it, so the stage was 239px on some chapters and 290px on
          others and the whole page jumped on every scene change — which is
          precisely what giving it a ratio was supposed to prevent. Measured
          across all ten at 360px and 390px, so the height is the tallest scene
          plus its padding rather than a guess.
        */}
        <div className="relative flex h-[20.5rem] items-center justify-center bg-surface-sunken px-4 py-4 sm:aspect-16/9 sm:h-auto sm:px-10 sm:py-0 lg:aspect-[2.2/1] lg:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: "radial-gradient(circle, var(--line-strong) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
              maskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 10%, transparent 70%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 70% 70% at 50% 50%, black 10%, transparent 70%)",
            }}
          />

          <div className="relative flex w-full justify-center">
            {/* Keyed on the scene id: remounting is what restarts the entrance
                animation for each beat. */}
            {activeScene ? <DemoScene key={activeScene.id} id={activeScene.id} /> : null}
          </div>
        </div>

        {/*
          Caption. A live region so the narration is announced as it changes,
          politely — it should not interrupt whatever is being read.

          Below the stage on a phone, overlaid from `sm` up. Overlaying it at
          every width is what put it on top of the scene: measured, it covered
          between 10 and 55 pixels of content on every one of the ten chapters
          at 390px, and all ten at 360px. There is no phone width at which a
          scene and a subtitle both fit in the same rectangle, so on a phone
          they get one each.
        */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="flex min-h-20 items-center border-t border-line bg-surface-sunken px-3 py-2.5 sm:absolute sm:inset-x-8 sm:bottom-5 sm:block sm:min-h-0 sm:border-0 sm:bg-transparent sm:p-0"
        >
          {/*
            Two treatments, because the caption is doing two different jobs.

            Overlaid on the stage from `sm` up, it is a subtitle and needs the
            dark pill to separate it from whatever is behind it. In its own band
            on a phone there is nothing to separate it from, so it is simply
            text on the band — a bright pill there is loud for no purpose.

            Either way the colours come from a matched pair. The previous
            `bg-ink/85` with `text-white` was legible in the light theme and
            close to invisible in the dark one, where `--ink` is a near-white:
            white text on an almost-white box, about 1.1:1. It went unnoticed
            because every screenshot review had been in the light theme.
          */}
          <p className="mx-auto w-full max-w-lg rounded-lg px-3 py-2 text-center text-xs leading-relaxed text-ink sm:bg-ink/90 sm:text-sm sm:text-ink-inverse sm:backdrop-blur-sm">
            {activeScene?.caption}
          </p>
        </div>
      </div>

      {/*
        The narration.

        Not autoplaying: this element only exists once somebody has pressed
        "Watch how Locora works", so every play here follows a deliberate
        gesture. That matters beyond browser policy — the landing page of a
        missing-person service may well be opened in a waiting room or on a bus,
        and sound nobody asked for would be a real intrusion. Which is also why
        the choice is remembered rather than re-asked on every visit.

        `preload="auto"` because the component is mounted only after that press,
        so the fetch is never speculative, and waiting for it is the difference
        between a walkthrough that starts and one that stutters into life.
      */}
      <audio
        ref={audioRef}
        src={NARRATION_AUDIO_SRC}
        preload="auto"
        onError={() => setSoundBroken(true)}
        // The transport below is the control surface; a second set of native
        // controls would be two things claiming to be in charge.
        aria-hidden
        data-track="narration"
      />

      {/*
        The bed. `preload="metadata"` rather than `auto`, because the narration
        is what the walkthrough cannot start without and the two would otherwise
        compete for the connection on the first press of play.
      */}
      <audio
        ref={musicRef}
        src={SITE_MUSIC_SRC}
        preload="metadata"
        aria-hidden
        data-track="music"
      />

      {/* Transport */}
      <div className="border-t border-line bg-surface px-3 py-2.5 sm:px-4">
        <Scrubber activeIndex={activeIndex} elapsedMs={elapsedMs} onSeek={seekToScene} />

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={toggle}
            aria-label={finished ? "Replay" : playing ? "Pause" : "Play"}
            className="px-3"
          >
            {finished ? (
              <RotateCcw aria-hidden className="size-3.5" />
            ) : playing ? (
              <Pause aria-hidden className="size-3.5" />
            ) : (
              <Play aria-hidden className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {finished ? "Replay" : playing ? "Pause" : "Play"}
            </span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => seekToScene(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="Previous chapter"
            className="px-2"
          >
            <SkipBack aria-hidden className="size-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => seekToScene(activeIndex + 1)}
            disabled={activeIndex === SCENES.length - 1}
            aria-label="Next chapter"
            className="px-2"
          >
            <SkipForward aria-hidden className="size-3.5" />
          </Button>

          <p className="ml-1 text-xs text-ink-muted" data-numeric>
            <span className="sr-only">Elapsed </span>
            {formatTimecode(elapsedMs)}
            <span className="text-ink-subtle"> / {formatTimecode(TOTAL_DURATION_MS)}</span>
          </p>

          <p className="hidden min-w-0 flex-1 truncate px-2 text-xs font-medium text-ink sm:block">
            {activeIndex + 1}. {activeScene?.chapter}
          </p>

          {/*
            Sound, next to the transcript rather than beside the play button.

            The two are the same kind of control — how you would rather take
            this in — and putting them together says so. The label states which
            way it will go, not which state it is in, because "Sound on" as a
            label on a button that turns sound off is the oldest ambiguity in
            interface design.
          */}
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleSound}
            aria-pressed={!soundOn}
            className="ml-auto px-2 sm:ml-0"
          >
            {soundOn ? (
              <Volume2 aria-hidden className="size-3.5" />
            ) : (
              <VolumeX aria-hidden className="size-3.5" />
            )}
            <span className="hidden sm:inline">{soundOn ? "Mute" : "Unmute"}</span>
            <span className="sr-only">
              {soundOn ? "Mute the narration" : "Play the narration aloud"}
            </span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowTranscript((open) => !open)}
            aria-expanded={showTranscript}
            aria-controls="demo-transcript"
            className="px-2"
          >
            <ListVideo aria-hidden className="size-3.5" />
            <span className="hidden sm:inline">Transcript</span>
            {/*
              The visible label is hidden below `sm`, which left this an
              icon-only button with no accessible name on a phone — the icon is
              `aria-hidden`, so there was nothing for a screen reader to
              announce and nothing to address it by. A separate `sr-only` label
              rather than an `aria-label`, because an `aria-label` would
              override the visible text at wider widths and leave the two free
              to disagree.
            */}
            <span className="sr-only sm:hidden">Transcript</span>
          </Button>
        </div>
      </div>

      {/* The transcript is the same script the captions come from, so the two
          cannot disagree. Useful to anybody who would rather read than watch,
          and to a search engine. */}
      <div id="demo-transcript" hidden={!showTranscript} className="border-t border-line bg-surface-sunken">
        <ol className="max-h-72 space-y-3 overflow-y-auto px-4 py-4">
          {SCENES.map((scene, index) => (
            <li key={scene.id}>
              <button
                type="button"
                onClick={() => seekToScene(index)}
                className={cn(
                  "flex w-full gap-3 rounded-md p-2 text-left transition-colors hover:bg-surface-hover",
                  index === activeIndex && "bg-surface-hover",
                )}
              >
                <span className="mt-0.5 shrink-0 text-2xs tabular-nums text-ink-subtle">
                  {formatTimecode(sceneStartMs(index))}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-ink">{scene.chapter}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                    {scene.narration}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        {/*
          The music credit, in the transcript rather than over the picture.

          It has to appear somewhere: the bed is a third-party track served from
          `public/`, and music of that kind is frequently licensed on condition
          of attribution. The transcript is where the walkthrough already keeps
          the things a viewer might want rather than needs — so the credit is
          findable and permanent without being laid across the demonstration.

          Read from `script.ts` beside the file path, so swapping the track
          cannot leave the previous composer's name on screen.
        */}
        <p className="border-t border-line px-4 py-3 text-2xs text-ink-subtle">
          Music: <span className="text-ink-muted">{SITE_MUSIC_CREDIT.title}</span> by{" "}
          <span className="text-ink-muted">{SITE_MUSIC_CREDIT.artist}</span>, via{" "}
          {SITE_MUSIC_CREDIT.source}.
        </p>
      </div>
    </div>
  );
}

/**
 * The chapter scrubber.
 *
 * One segment per scene, each a button, rather than a single range input. A
 * range would allow seeking to an arbitrary millisecond, which is meaningless
 * here — there is nothing between beats to land on — and segments make the
 * chapter structure visible instead of hiding it behind a tooltip.
 */
function Scrubber({
  activeIndex,
  elapsedMs,
  onSeek,
}: {
  activeIndex: number;
  elapsedMs: number;
  onSeek: (index: number) => void;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label="Chapters">
      {SCENES.map((scene, index) => {
        const start = sceneStartMs(index);
        const progress =
          index < activeIndex
            ? 1
            : index > activeIndex
              ? 0
              : Math.min(1, Math.max(0, (elapsedMs - start) / sceneDurationMs(scene)));

        return (
          <button
            key={scene.id}
            type="button"
            onClick={() => onSeek(index)}
            // The chapter name is the accessible name; the bar itself is a
            // picture of progress and says nothing on its own.
            aria-label={`Chapter ${index + 1}: ${scene.chapter}`}
            aria-current={index === activeIndex ? "true" : undefined}
            title={scene.chapter}
            className="group relative h-6 flex-1 py-2"
          >
            <span className="block h-1.5 overflow-hidden rounded-full bg-line transition-colors group-hover:bg-line-strong">
              <span
                aria-hidden
                className="block h-full rounded-full bg-primary"
                // Width is set inline because it is a continuously changing
                // value; a Tailwind class cannot express it.
                style={{ width: `${progress * 100}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The reduced-motion alternative: the whole walkthrough as a readable document.
 *
 * Not a degraded version — for somebody who reads faster than a narration
 * plays, or who wants to check one step, this is the better artefact. It is the
 * same script, so it cannot fall out of step with the animated form.
 */
function Storyboard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line bg-surface-sunken px-4 py-3">
        <p className="text-sm font-semibold text-ink">How Locora works</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Shown as text because your system asks for reduced motion.
        </p>
      </div>

      <ol className="divide-y divide-line">
        {SCENES.map((scene, index) => (
          <li key={scene.id} className="flex gap-3 px-4 py-3.5">
            <span
              aria-hidden
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-2xs font-semibold text-primary"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{scene.chapter}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{scene.narration}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-1.5 border-t border-line bg-surface-sunken px-4 py-2.5">
        <ChevronRight aria-hidden className="size-3.5 text-ink-subtle" />
        <p className="text-xs text-ink-muted">
          Ten steps, from filing a report to a case being closed.
        </p>
      </div>
    </div>
  );
}
