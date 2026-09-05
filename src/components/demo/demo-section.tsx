"use client";

/**
 * The "See how Locora works" section on the landing page.
 *
 * ## Why the player is not rendered until asked for
 *
 * The landing page is the first thing somebody reaches, sometimes in an
 * emergency, sometimes on a bad connection. The walkthrough is worth having and
 * is not worth a single byte on the critical path — so what renders initially is
 * a poster frame, and the player is `next/dynamic`-imported when somebody
 * actually presses play. Nobody who came here to file a report pays for a
 * demonstration they did not watch.
 *
 * That is the same reasoning behind not embedding a third-party video player,
 * which would cost a cross-origin script, a cookie banner's worth of tracking,
 * and an entry in the Content-Security-Policy — before anybody pressed anything.
 *
 * ## The poster frame is not a placeholder
 *
 * It states what the walkthrough covers and how long it takes, so somebody can
 * decide whether to spend two minutes without spending them first. A poster that
 * is only a play button on a blurred still asks people to gamble.
 *
 * ## The three stages have to share one aspect ratio
 *
 * This poster, the loading skeleton below it and the player's own stage in
 * `demo-player.tsx` all describe the same rectangle at three moments, so any
 * ratio added to one belongs on all three. When the player's stage moved to
 * 2.2:1 above `lg` and these two stayed at 16:9, pressing play resized the
 * section by 77 pixels underneath the pointer — the reason the player has a
 * fixed ratio at all was to stop exactly that.
 */

import { Clock, Play } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { SCENES, TOTAL_DURATION_MS, formatTimecode } from "./script";

/**
 * Loaded on demand, and never on the server.
 *
 * `ssr: false` because the player is entirely interactive — server-rendering it
 * would ship the markup for a paused first frame that is immediately replaced,
 * and it has no value to a crawler. The transcript, which does have value to a
 * crawler, is in the static section below instead.
 */
const DemoPlayer = dynamic(() => import("./demo-player").then((module) => module.DemoPlayer), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="flex aspect-4/3 items-center justify-center rounded-2xl border border-line bg-surface-sunken sm:aspect-16/9 lg:aspect-[2.2/1]"
    >
      <p className="text-sm text-ink-muted">Loading the walkthrough…</p>
    </div>
  ),
});

export function DemoSection() {
  const [started, setStarted] = useState(false);

  return (
    <div className="mx-auto max-w-4xl">
      {started ? (
        <DemoPlayer autoStart />
      ) : (
        <PosterFrame onStart={() => setStarted(true)} />
      )}
    </div>
  );
}

function PosterFrame({ onStart }: { onStart: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
      <div className="relative flex aspect-4/3 flex-col items-center justify-center px-6 text-center sm:aspect-16/9 lg:aspect-[2.2/1]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(circle, var(--line-strong) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "radial-gradient(ellipse 70% 70% at 50% 45%, black 10%, transparent 72%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 70% at 50% 45%, black 10%, transparent 72%)",
          }}
        />

        <div className="relative flex flex-col items-center">
          <Button
            size="lg"
            onClick={onStart}
            className="h-14 gap-2.5 rounded-full px-7 text-base shadow-md"
          >
            <Play aria-hidden className="size-5 fill-current" />
            Watch how Locora works
          </Button>

          <p className="mt-4 flex items-center gap-1.5 text-sm text-ink-muted">
            <Clock aria-hidden className="size-3.5" />
            {formatTimecode(TOTAL_DURATION_MS)} · {SCENES.length} chapters · narrated
          </p>

          <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-muted">
            Follow one fictional case from the moment it is filed, through review and matching, to
            the point where it closes — and see exactly which parts a person decides.
          </p>
        </div>
      </div>

      {/*
        The chapter list is rendered statically, before anybody presses play.
        It is what tells a visitor whether the walkthrough answers their question,
        and it is the part a search engine can read — the player itself is
        client-only.
      */}
      <div className="border-t border-line bg-surface-sunken px-4 py-3">
        <h3 className="sr-only">Chapters in this walkthrough</h3>
        <ol className="flex flex-wrap gap-x-4 gap-y-1.5">
          {SCENES.map((scene, index) => (
            <li key={scene.id} className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span aria-hidden className="text-ink-subtle" data-numeric>
                {index + 1}
              </span>
              {scene.chapter}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
