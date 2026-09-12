// PROTOTYPE — Field Guide exercise discovery. Throwaway; see README.md.
//
// Original line-art movement glyphs, one per broad movement family. Deliberately a
// SMALL, consistent set — the whole point is visual variety across 100+ exercises
// without 100+ bespoke drawings (the brief). Each is a minimal figure caught mid-
// pattern on a common 48×48 grid, drawn in `currentColor` so it inherits the field-
// guide entry's ink and re-themes for free under every Skin. `movement` is the neutral
// generic, shown only when no family is confidently asserted.

import type { MovementFamily } from "@/lib/prototype/movement-family";

interface MovementGlyphProps {
  family: MovementFamily;
  // Dim the glyph a touch when the family was only inferred from muscles, so a confident
  // "named" match reads as the bolder statement. Purely presentational.
  dimmed?: boolean;
  className?: string;
  // Decorative by default (the label carries the meaning); pass a title to announce it.
  title?: string;
}

// Shared canvas: consistent stroke weight, round joins, a faint ground line where the
// pattern is performed standing. Individual figures only supply their pose paths.
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const HEAD_R = 3.2;

// Each family's pose as a fragment on the 48×48 grid. Heads are circles; limbs are
// polylines; implements (bars, weights) are the straight segments. Kept legible at the
// ~28px the list rows render them and the 64px the detail hero uses.
const POSES: Record<MovementFamily, React.JSX.Element> = {
  // SQUAT — knees and hips bent deep, a bar racked across the shoulders.
  squat: (
    <>
      <line x1="10" y1="18" x2="30" y2="18" {...STROKE} />
      <circle cx="20" cy="15" r={HEAD_R} {...STROKE} />
      <polyline points="20,18 20,28" {...STROKE} />
      <polyline points="20,20 13,25" {...STROKE} />
      <polyline points="20,20 27,25" {...STROKE} />
      <polyline points="20,28 14,30 15,38" {...STROKE} />
      <polyline points="20,28 26,30 25,38" {...STROKE} />
    </>
  ),
  // HINGE — hips pushed back, flat back tipped forward, a bar hanging from the hands.
  hinge: (
    <>
      <circle cx="13" cy="16" r={HEAD_R} {...STROKE} />
      <polyline points="16,17 30,24" {...STROKE} />
      <polyline points="30,24 32,38" {...STROKE} />
      <polyline points="30,24 26,38" {...STROKE} />
      <polyline points="18,18 18,36" {...STROKE} />
      <line x1="13" y1="36" x2="23" y2="36" {...STROKE} />
    </>
  ),
  // PUSH — a bar pressed overhead, arms extended up.
  push: (
    <>
      <line x1="11" y1="9" x2="29" y2="9" {...STROKE} />
      <polyline points="15,11 20,18" {...STROKE} />
      <polyline points="25,11 20,18" {...STROKE} />
      <circle cx="20" cy="21" r={HEAD_R} {...STROKE} />
      <polyline points="20,24 20,33" {...STROKE} />
      <polyline points="20,33 15,40" {...STROKE} />
      <polyline points="20,33 25,40" {...STROKE} />
    </>
  ),
  // PULL — hands high on a fixed bar, body drawn up toward it.
  pull: (
    <>
      <line x1="9" y1="9" x2="31" y2="9" {...STROKE} />
      <polyline points="15,9 19,17" {...STROKE} />
      <polyline points="25,9 21,17" {...STROKE} />
      <circle cx="20" cy="20" r={HEAD_R} {...STROKE} />
      <polyline points="20,23 20,32" {...STROKE} />
      <polyline points="20,32 16,39" {...STROKE} />
      <polyline points="20,32 24,39" {...STROKE} />
    </>
  ),
  // CARRY — upright, braced, a weight hanging at each side.
  carry: (
    <>
      <circle cx="20" cy="12" r={HEAD_R} {...STROKE} />
      <polyline points="20,15 20,30" {...STROKE} />
      <polyline points="20,30 16,40" {...STROKE} />
      <polyline points="20,30 24,40" {...STROKE} />
      <line x1="12" y1="18" x2="12" y2="30" {...STROKE} />
      <line x1="28" y1="18" x2="28" y2="30" {...STROKE} />
      <polyline points="20,18 12,18" {...STROKE} />
      <polyline points="20,18 28,18" {...STROKE} />
      <rect x="9" y="30" width="6" height="4" rx="1" {...STROKE} />
      <rect x="25" y="30" width="6" height="4" rx="1" {...STROKE} />
    </>
  ),
  // LOCOMOTION — a running stride, arms and legs mid-swing, motion marks behind.
  locomotion: (
    <>
      <circle cx="22" cy="13" r={HEAD_R} {...STROKE} />
      <polyline points="22,16 21,27" {...STROKE} />
      <polyline points="21,27 15,34" {...STROKE} />
      <polyline points="21,27 30,32 28,39" {...STROKE} />
      <polyline points="22,19 29,22" {...STROKE} />
      <polyline points="22,19 15,24" {...STROKE} />
      <line x1="6" y1="15" x2="11" y2="15" {...STROKE} strokeWidth={1.4} />
      <line x1="5" y1="21" x2="12" y2="21" {...STROKE} strokeWidth={1.4} />
    </>
  ),
  // CORE — a forearm plank: a braced line held off the ground.
  core: (
    <>
      <circle cx="11" cy="22" r={HEAD_R} {...STROKE} />
      <polyline points="14,23 36,31" {...STROKE} />
      <polyline points="14,23 12,33" {...STROKE} />
      <line x1="9" y1="33" x2="16" y2="33" {...STROKE} />
      <polyline points="36,31 33,33" {...STROKE} />
      <line x1="30" y1="33" x2="38" y2="33" {...STROKE} />
    </>
  ),
  // MOVEMENT — the neutral generic: a motion spark, no pattern claimed.
  movement: (
    <>
      <circle cx="24" cy="24" r="7" {...STROKE} strokeDasharray="2 3" />
      <line x1="24" y1="10" x2="24" y2="14" {...STROKE} />
      <line x1="24" y1="34" x2="24" y2="38" {...STROKE} />
      <line x1="10" y1="24" x2="14" y2="24" {...STROKE} />
      <line x1="34" y1="24" x2="38" y2="24" {...STROKE} />
    </>
  ),
};

export function MovementGlyph({
  family,
  dimmed = false,
  className,
  title,
}: MovementGlyphProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      style={dimmed ? { opacity: 0.55 } : undefined}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {POSES[family]}
    </svg>
  );
}
