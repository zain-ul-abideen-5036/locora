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
 * play and pause, a scrubber, chapters, elapsed time, captions and a full
 * transcript. There is no audio track, which also means there is no
 * autoplay-with-sound problem to solve.
 *
 * ## Timing
 *
 * Driven by `requestAnimationFrame` accumulating real elapsed time rather than
 * by an interval counting ticks. An interval drifts whenever the tab is
 * throttled or a frame is slow, so the captions gradually desynchronise from
 * the visuals over a two-minute run. Reading the clock each frame cannot drift.
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
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "@/lib/use-reduced-motion";

import { DemoScene } from "./scenes";
import {
  formatTimecode,
  SCENES,
  sceneDurationMs,
  sceneIndexAt,
  sceneStartMs,
  TOTAL_DURATION_MS,
} from "./script";

export function DemoPlayer({ autoStart = false }: { autoStart?: boolean }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(autoStart);
  const [finished, setFinished] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const reducedMotion = useReducedMotion();

  const frameRef = useRef<number | undefined>(undefined);
  const lastTickRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!playing || reducedMotion) return;

    function tick(now: number) {
      const previous = lastTickRef.current ?? now;
      lastTickRef.current = now;

      setElapsedMs((current) => {
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

      frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      // Cleared so resuming does not count the paused interval as elapsed time.
      lastTickRef.current = undefined;
    };
  }, [playing, reducedMotion]);

  const activeIndex = sceneIndexAt(elapsedMs);
  const activeScene = SCENES[activeIndex];

  const seekToScene = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, SCENES.length - 1));
    setElapsedMs(sceneStartMs(clamped));
    setFinished(false);
  }, []);

  const toggle = useCallback(() => {
    if (finished) {
      setElapsedMs(0);
      setFinished(false);
      setPlaying(true);
      return;
    }
    setPlaying((current) => !current);
  }, [finished]);

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
      <div className="relative flex aspect-4/3 items-center justify-center bg-surface-sunken px-4 sm:aspect-16/9 sm:px-10 lg:aspect-[2.2/1] lg:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(circle, var(--line-strong) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 10%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 10%, transparent 70%)",
          }}
        />

        <div className="relative flex w-full justify-center">
          {/* Keyed on the scene id: remounting is what restarts the entrance
              animation for each beat. */}
          {activeScene ? <DemoScene key={activeScene.id} id={activeScene.id} /> : null}
        </div>

        {/* Caption. A live region so the narration is announced as it changes,
            politely — it should not interrupt whatever is being read. */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="absolute inset-x-3 bottom-3 sm:inset-x-8 sm:bottom-5"
        >
          <p className="mx-auto max-w-lg rounded-lg bg-ink/85 px-3 py-2 text-center text-xs leading-relaxed text-white backdrop-blur-sm sm:text-sm">
            {activeScene?.caption}
          </p>
        </div>
      </div>

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

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowTranscript((open) => !open)}
            aria-expanded={showTranscript}
            aria-controls="demo-transcript"
            className="ml-auto px-2 sm:ml-0"
          >
            <ListVideo aria-hidden className="size-3.5" />
            <span className="hidden sm:inline">Transcript</span>
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
