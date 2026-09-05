"use client";

/**
 * The visuals for each beat of the walkthrough.
 *
 * ## Abstractions, not screenshots
 *
 * Each scene is a stylised representation of the interface rather than a
 * captured image of it. That is a deliberate choice with three payoffs: the
 * visuals cannot go stale when the real UI changes, they carry no fabricated
 * personal data at any resolution, and they stay legible on a phone where a
 * scaled-down screenshot of a form is an unreadable grey smear.
 *
 * ## Everything on screen is fictional and says so
 *
 * The one case used throughout is labelled as an example in the interface
 * itself. A demo illustrating a feature with something that looked like a real
 * missing person would be indefensible.
 *
 * ## Motion
 *
 * Each scene animates in with the shared `fade-up`, keyed on the scene id so
 * React remounts it and the animation restarts. Nothing loops, nothing moves
 * continuously, and the whole thing is inert under `prefers-reduced-motion` —
 * the global rule in globals.css collapses every animation to a step, leaving
 * the same readable composition without the movement.
 */

import {
  BellRing,
  Camera,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Link2,
  Lock,
  MapPin,
  Search,
  ShieldCheck,
  UserRound,
  UserSearch,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import type { SceneId } from "./script";

/** A device-agnostic frame, so the scenes read as "an interface" without imitating one. */
function Panel({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl border border-line bg-surface shadow-sm",
        className,
      )}
    >
      {label ? (
        <div className="flex items-center gap-2 border-b border-line bg-surface-sunken px-3 py-2">
          <span className="flex gap-1" aria-hidden>
            <span className="size-1.5 rounded-full bg-line-strong" />
            <span className="size-1.5 rounded-full bg-line-strong" />
            <span className="size-1.5 rounded-full bg-line-strong" />
          </span>
          <span className="text-2xs font-medium text-ink-subtle">{label}</span>
        </div>
      ) : null}
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

/** A stand-in for a line of text. Never lorem ipsum — it is not pretending to be words. */
function Line({ width = "100%", strong = false }: { width?: string; strong?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("block h-2 rounded-full", strong ? "bg-line-strong" : "bg-line")}
      style={{ width }}
    />
  );
}

function Chip({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: "neutral" | "missing" | "found" | "positive" | "caution" | "primary";
  icon?: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-sunken text-ink-muted border-line",
    missing: "bg-missing-soft text-missing-fg border-transparent",
    found: "bg-found-soft text-found-fg border-transparent",
    positive: "bg-positive-soft text-positive-fg border-transparent",
    caution: "bg-caution-soft text-caution-fg border-transparent",
    primary: "bg-primary-soft text-primary border-transparent",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-2xs font-medium",
        tones[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** The fictional case card the walkthrough follows, marked as an example. */
function ExampleCaseCard({ status }: { status: "queued" | "live" | "matched" | "resolved" }) {
  const badge = {
    queued: <Chip tone="neutral" icon={<ClipboardList aria-hidden className="size-3" />}>Awaiting review</Chip>,
    live: <Chip tone="primary" icon={<Eye aria-hidden className="size-3" />}>Published</Chip>,
    matched: <Chip tone="found" icon={<Link2 aria-hidden className="size-3" />}>Possible match</Chip>,
    resolved: <Chip tone="positive" icon={<CheckCircle2 aria-hidden className="size-3" />}>Resolved</Chip>,
  }[status];

  return (
    <Panel>
      <div className="flex gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-subtle">
          <UserRound aria-hidden className="size-6" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone="missing">Missing</Chip>
            {badge}
          </div>
          <p className="font-display text-sm font-semibold text-ink">
            Example Case
            <span className="ml-1.5 text-2xs font-normal text-ink-subtle">(fictional)</span>
          </p>
          <p className="text-2xs text-ink-muted">Age 12 · last seen in a city centre</p>
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function ArriveScene() {
  return (
    <div className="grid w-full max-w-lg lg:max-w-2xl gap-3">
      <Panel label="locora.app">
        <div className="space-y-3 text-center">
          <p className="font-display text-lg font-bold tracking-tight text-ink">Find what matters.</p>
          <p className="mx-auto max-w-xs text-2xs leading-relaxed text-ink-muted">
            Report a missing person, report someone who has been found, and help reunite them.
          </p>
          <div className="flex justify-center gap-2">
            <span className="rounded-md bg-primary px-3 py-1.5 text-2xs font-medium text-primary-fg">
              Report a missing person
            </span>
            <span className="rounded-md border border-line-strong px-3 py-1.5 text-2xs font-medium text-ink">
              I have found someone
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function PurposeScene() {
  return (
    <div className="grid w-full max-w-2xl lg:max-w-3xl gap-4 sm:grid-cols-2">
      <Panel className="border-missing/30">
        <div className="space-y-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-missing-soft text-missing-fg">
            <UserSearch aria-hidden className="size-4" />
          </span>
          <p className="text-xs font-semibold text-ink">Missing person</p>
          <p className="text-2xs leading-relaxed text-ink-muted">
            Filed by somebody searching. Has a name, an age, a last known place.
          </p>
        </div>
      </Panel>

      <Panel className="border-found/30">
        <div className="space-y-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-found-soft text-found-fg">
            <UserRound aria-hidden className="size-4" />
          </span>
          <p className="text-xs font-semibold text-ink">Found person</p>
          <p className="text-2xs leading-relaxed text-ink-muted">
            Filed by somebody who found them. No name — an age range and a description.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function FileScene() {
  return (
    <div className="w-full max-w-md lg:max-w-xl">
      <Panel label="Report a missing person">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-2xs font-medium text-ink">Their full name</p>
            <div className="flex h-7 items-center rounded-md border border-accent bg-surface px-2 shadow-[0_0_0_3px_var(--accent-soft)]">
              <span className="text-2xs text-ink">Example Name</span>
              <span aria-hidden className="ml-0.5 h-3 w-px animate-pulse-soft bg-accent" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <p className="text-2xs font-medium text-ink">Age</p>
              <div className="flex h-7 items-center rounded-md border border-line px-2 text-2xs text-ink">12</div>
            </div>
            <div className="space-y-1.5">
              <p className="text-2xs font-medium text-ink">Gender</p>
              <div className="flex h-7 items-center rounded-md border border-line px-2 text-2xs text-ink-muted">
                Choose…
              </div>
            </div>
          </div>
          <p className="text-2xs text-ink-subtle">Anything you are unsure of can be left blank.</p>
        </div>
      </Panel>
    </div>
  );
}

function DetailsScene() {
  return (
    <div className="grid w-full max-w-2xl lg:max-w-3xl gap-4 sm:grid-cols-[1.1fr_1fr]">
      <Panel label="Photographs">
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line py-4">
            <Camera aria-hidden className="size-4 text-ink-subtle" />
            <span className="text-2xs text-ink-muted">Choose photographs</span>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                aria-hidden
                className="flex size-9 items-center justify-center rounded-md border border-line bg-surface-sunken text-ink-subtle"
              >
                <UserRound className="size-4" />
              </span>
            ))}
          </div>
        </div>
      </Panel>

      <Panel label="Contact details">
        <div className="space-y-2">
          <Line width="70%" strong />
          <Line width="55%" />
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-primary-soft px-2 py-1.5">
            <Lock aria-hidden className="size-3 shrink-0 text-primary" />
            <span className="text-2xs font-medium text-primary">Never shown publicly</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function QueueScene() {
  return (
    <div className="w-full max-w-lg lg:max-w-2xl space-y-3">
      <ExampleCaseCard status="queued" />
      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5">
        <ClipboardList aria-hidden className="size-3.5 text-ink-subtle" />
        <span className="text-2xs text-ink-muted">
          In the review queue — not visible to the public
        </span>
      </div>
    </div>
  );
}

function ReviewScene() {
  return (
    <div className="w-full max-w-lg lg:max-w-2xl">
      <Panel label="Review console">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs font-medium text-ink">Example Case</p>
            <Chip tone="caution">waiting 2 hours</Chip>
          </div>
          <div className="space-y-1.5">
            <Line width="90%" />
            <Line width="65%" />
          </div>
          <div className="flex gap-1.5 border-t border-line pt-2.5">
            <span className="rounded-md bg-primary px-2.5 py-1 text-2xs font-medium text-primary-fg">
              Publish
            </span>
            <span className="rounded-md border border-line-strong px-2.5 py-1 text-2xs font-medium text-ink">
              Decline
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-2xs text-ink-subtle">
              <ShieldCheck aria-hidden className="size-3" />
              recorded
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function FoundScene() {
  return (
    <div className="w-full max-w-md lg:max-w-xl">
      <Panel label="Report someone found">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <p className="text-2xs font-medium text-ink">Youngest</p>
              <div className="flex h-7 items-center rounded-md border border-line px-2 text-2xs text-ink">10</div>
            </div>
            <div className="space-y-1.5">
              <p className="text-2xs font-medium text-ink">Oldest</p>
              <div className="flex h-7 items-center rounded-md border border-line px-2 text-2xs text-ink">15</div>
            </div>
          </div>
          <p className="text-2xs text-ink-subtle">An age range, because that is what an honest answer looks like.</p>
          <div className="flex items-center gap-1.5 rounded-md bg-primary-soft px-2 py-1.5">
            <Lock aria-hidden className="size-3 shrink-0 text-primary" />
            <span className="text-2xs font-medium text-primary">Where they are now stays private</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function MatchScene() {
  return (
    <div className="w-full max-w-2xl lg:max-w-3xl">
      <Panel label="Looking for a match">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Search aria-hidden className="size-3.5 text-ink-subtle" />
            <p className="text-2xs text-ink-muted">Ranked candidates</p>
          </div>

          <div className="rounded-lg border border-found/30 bg-found-soft/40 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-2xs font-semibold text-ink">Found-person report</p>
              <Chip tone="found">3 in common</Chip>
            </div>
            <ul className="mt-1.5 space-y-1">
              {["Same city", "Estimated age is consistent", "Found after they were last seen"].map(
                (reason) => (
                  <li key={reason} className="flex items-center gap-1.5 text-2xs text-ink-muted">
                    <span aria-hidden className="size-1 rounded-full bg-found" />
                    {reason}
                  </li>
                ),
              )}
            </ul>
          </div>

          <p className="text-2xs text-ink-subtle">
            A shortlist, not a verdict. A reviewer reads both cases in full.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function NotifyScene() {
  return (
    <div className="w-full max-w-lg lg:max-w-2xl space-y-2.5">
      {[
        "The family searching",
        "The person who found them",
      ].map((who) => (
        <Panel key={who}>
          <div className="flex gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-found-soft text-found-fg">
              <BellRing aria-hidden className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-semibold text-ink">A possible match on your report</p>
              <p className="mt-0.5 text-2xs text-ink-muted">
                Nothing is confirmed yet — a person checks every link.
              </p>
              <p className="mt-1 text-2xs text-ink-subtle">to {who}</p>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function ResolveScene() {
  return (
    <div className="w-full max-w-lg lg:max-w-2xl space-y-3">
      <ExampleCaseCard status="resolved" />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2">
          <CheckCircle2 aria-hidden className="size-3.5 shrink-0 text-positive" />
          <span className="text-2xs text-ink-muted">Removed from the public feed</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2">
          <FileText aria-hidden className="size-3.5 shrink-0 text-positive" />
          <span className="text-2xs text-ink-muted">Photographs deleted</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const SCENE_COMPONENTS: Record<SceneId, () => ReactNode> = {
  arrive: ArriveScene,
  purpose: PurposeScene,
  file: FileScene,
  details: DetailsScene,
  queue: QueueScene,
  review: ReviewScene,
  found: FoundScene,
  match: MatchScene,
  notify: NotifyScene,
  resolve: ResolveScene,
};

export function DemoScene({ id }: { id: SceneId }) {
  const Component = SCENE_COMPONENTS[id];

  return (
    <div
      // Keyed by the caller on the scene id, so React remounts this subtree and
      // the entrance animation restarts on every scene change.
      className="flex w-full items-center justify-center animate-fade-up"
    >
      <Component />
    </div>
  );
}

/** A small map pin used by the poster frame, kept out of the scene set. */
export function DemoPosterArt() {
  return (
    <div className="pointer-events-none flex items-center gap-2 text-ink-subtle">
      <MapPin aria-hidden className="size-4" />
    </div>
  );
}
