import { cn } from "@/lib/cn";

/**
 * The hero illustration: four portraits, two of them linked.
 *
 * ## Why this is drawn and not photographed
 *
 * A row of photographs of real people on the landing page of a missing-person
 * service does not read as decoration. It reads as *these are the missing* —
 * which would be a fabricated case on the most prominent surface the product
 * has, and worse with stock photographs of children. The rest of this codebase
 * refuses to invent a statistic or a partnership; inventing a face would be the
 * same lie with a larger audience.
 *
 * Drawn figures cannot be mistaken for a case. They are also the only version
 * that has no background to remove, stays crisp at any size, costs no request,
 * and recolours itself correctly in both themes.
 *
 * ## Why it says something rather than just showing people
 *
 * Four faces would mean "this product is about people", which the heading next
 * to it already says better. So two of them are joined: one toned as a
 * missing-person report, one as a found-person report, connected through a
 * point on the line between them. That is the whole product in one image — two
 * reports filed by strangers, brought together by a person in the middle — and
 * it is the one claim the hero makes that the copy cannot make as quickly.
 *
 * The connector is two arcs converging on that point rather than a straight
 * line, echoing the mark in `brand/logo.tsx`: a signal closing in on a
 * location. It makes the illustration Locora's rather than any humanitarian
 * product's.
 *
 * ## Drawing rules
 *
 * The figures are geometric and deliberately unspecific — a head, a shoulder
 * line, one distinguishing feature each. Enough to read as different people,
 * far short of caricature. Nobody depicted is identifiable, because nobody
 * depicted exists.
 *
 * Every colour is a theme token, so the composition inverts correctly rather
 * than being drawn twice. There is no gradient and no coloured glow: the
 * shadow is the same contact-plus-ambient pair the rest of the product uses.
 */

/** Which palette a portrait is toned with, and therefore what it stands for. */
type Tone = "missing" | "found" | "neutral";

const TONES: Record<Tone, { panel: string; figure: string }> = {
  // The two case types keep the hues they have everywhere else in the product,
  // so the link reads as "a missing report and a found report" to anyone who
  // has scrolled the feed, without a legend.
  missing: { panel: "var(--missing-soft)", figure: "var(--missing-fg)" },
  found: { panel: "var(--found-soft)", figure: "var(--found-fg)" },
  // `surface-raised`, not `surface-sunken`. Sunken is *darker than the canvas*
  // in the dark theme, so the untinted panels sank into the page and only their
  // borders showed. Raised reads as a panel sitting on the background in both.
  neutral: { panel: "var(--surface-raised)", figure: "var(--ink-muted)" },
};

interface Portrait {
  x: number;
  y: number;
  size: number;
  tone: Tone;
  /** The single feature that separates this person from the others. */
  feature: "child" | "bun" | "scarf" | "glasses";
}

/**
 * Placed by hand rather than on a grid.
 *
 * Four equal squares in two rows would read as a contact sheet — which is
 * precisely the "gallery of the missing" impression this is avoiding. The
 * sizes and offsets are uneven so it reads as a group of people rather than a
 * set of records.
 */
const PORTRAITS: readonly Portrait[] = [
  { x: 16, y: 78, size: 138, tone: "missing", feature: "child" },
  { x: 196, y: 16, size: 110, tone: "neutral", feature: "bun" },
  { x: 210, y: 196, size: 150, tone: "found", feature: "scarf" },
  { x: 48, y: 250, size: 112, tone: "neutral", feature: "glasses" },
];

/** Centre of a portrait, for aiming the connector. */
function centre(portrait: Portrait) {
  return { cx: portrait.x + portrait.size / 2, cy: portrait.y + portrait.size / 2 };
}

/**
 * One figure, drawn inside a 100x100 box and scaled by the caller.
 *
 * Head, shoulders, one feature. The shoulder line stops at the bottom edge so
 * the portrait is cropped the way a real one would be, rather than floating as
 * a complete little person in a box.
 */
function Figure({ feature, fill }: { feature: Portrait["feature"]; fill: string }) {
  /*
    Flat silhouettes, with the difference carried by the outline.

    The first attempt drew hair as a separate shape in the same fill, which is
    invisible by definition: a shape the colour of the thing behind it merges
    with it, and each figure came out as an anonymous blob. So the only features
    kept are ones that change the edge — a bun above the crown, a scarf that
    falls wider than a head would — plus the spectacles, which work precisely
    because they are cut in the panel colour rather than added in the figure's.

    Head and shoulders overlap by a couple of units. Meeting exactly leaves a
    hairline seam where the antialiasing of two edges does not quite add up.
  */
  const head = feature === "child" ? { cy: 48, r: 18 } : { cy: 44, r: 20 };

  return (
    <g fill={fill}>
      {/* Narrower on the child: the proportion is what reads as a child, more
          reliably than any feature drawn on top of it. */}
      <path
        d={
          feature === "child"
            ? "M24,100 C24,80 35,64 50,64 C65,64 76,80 76,100 Z"
            : "M14,100 C14,76 30,62 50,62 C70,62 86,76 86,100 Z"
        }
      />

      {feature === "scarf" ? (
        // One mass from crown to shoulder, wider and squarer at the jaw than a
        // head is. Kept to roughly the height of the others: drawn taller it
        // filled its panel edge to edge and read as a hood rather than a person.
        <path d="M50,18 C34,18 27,30 27,45 C27,58 31,67 36,75 L64,75 C69,67 73,58 73,45 C73,30 66,18 50,18 Z" />
      ) : (
        <circle cx="50" cy={head.cy} r={head.r} />
      )}

      {feature === "bun" ? <circle cx="50" cy="19" r="8.5" /> : null}

      {feature === "glasses" ? (
        <g fill="none" stroke="currentColor" strokeWidth="3">
          <circle cx="41" cy="45" r="7.5" />
          <circle cx="59" cy="45" r="7.5" />
          <path d="M48.5,45 H51.5" />
        </g>
      ) : null}
    </g>
  );
}

export function HeroPortraits({ className }: { className?: string }) {
  const from = centre(PORTRAITS[0]!);
  const to = centre(PORTRAITS[2]!);
  // The point the two arcs meet, offset from the midpoint so the pair of arcs
  // is asymmetric and reads as motion rather than as a bracket.
  const link = { cx: (from.cx + to.cx) / 2 - 8, cy: (from.cy + to.cy) / 2 - 6 };

  return (
    <svg
      viewBox="0 0 376 376"
      role="img"
      aria-label="An illustration of four people. Two of them are joined by a line meeting at a point — the way a missing-person report and a found-person report are brought together."
      className={cn("h-auto w-full", className)}
    >
      <defs>
        <filter id="portrait-lift" x="-20%" y="-20%" width="140%" height="140%">
          {/* Contact shadow then ambient, the pair used everywhere else. Never a
              coloured glow — that is the strongest "template" signal there is. */}
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="var(--shadow-tint-weak)" />
          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="var(--shadow-tint)" />
        </filter>
      </defs>

      {/*
        The connector sits under the portraits, so it emerges from behind them
        rather than being drawn across their faces.
      */}
      <g fill="none" stroke="var(--line-strong)" strokeWidth="2" strokeLinecap="round">
        <path d={`M${from.cx},${from.cy} Q${from.cx + 40},${link.cy - 34} ${link.cx},${link.cy}`} />
        <path d={`M${to.cx},${to.cy} Q${to.cx - 46},${link.cy + 30} ${link.cx},${link.cy}`} />
      </g>

      {PORTRAITS.map((portrait) => {
        const tone = TONES[portrait.tone];
        return (
          <g key={`${portrait.x}-${portrait.y}`}>
            <clipPath id={`clip-${portrait.x}-${portrait.y}`}>
              <rect
                x={portrait.x}
                y={portrait.y}
                width={portrait.size}
                height={portrait.size}
                rx={portrait.size * 0.3}
              />
            </clipPath>

            <rect
              x={portrait.x}
              y={portrait.y}
              width={portrait.size}
              height={portrait.size}
              rx={portrait.size * 0.3}
              fill={tone.panel}
              stroke="var(--line)"
              strokeWidth="1"
              filter="url(#portrait-lift)"
            />

            {/*
              Two nested groups, and the nesting is the whole point.

              `clip-path` resolves in the coordinate system the element sits in,
              and an element's own `transform` moves its clip along with it. Put
              both on one group and the clip rectangle — written in outer
              coordinates — is translated and scaled away from the panel it is
              meant to be clipping, which leaves a sliver of one shoulder and
              nothing else. The clip goes on an untransformed parent; the scale
              goes on the child.
            */}
            <g clipPath={`url(#clip-${portrait.x}-${portrait.y})`}>
              <g
                transform={`translate(${portrait.x} ${portrait.y}) scale(${portrait.size / 100})`}
                // `currentColor` inside the figure resolves to the panel, which
                // is what lets the spectacles read as glass.
                style={{ color: tone.panel }}
              >
                <Figure feature={portrait.feature} fill={tone.figure} />
              </g>
            </g>
          </g>
        );
      })}

      {/*
        The point where the two arcs meet: the review step, which is the only
        place a link is ever made. Drawn last so it sits above everything.
      */}
      <g filter="url(#portrait-lift)">
        <circle cx={link.cx} cy={link.cy} r="21" fill="var(--surface)" stroke="var(--line)" />
        <circle cx={link.cx} cy={link.cy} r="7" fill="var(--primary)" />
      </g>
    </svg>
  );
}
