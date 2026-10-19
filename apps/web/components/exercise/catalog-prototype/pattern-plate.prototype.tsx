// PROTOTYPE — throwaway. Candidate replacement for `movement-glyph.tsx`: bold pictogram
// figures (thick round strokes, filled heads) instead of 2px stick figures, with the
// implement and the direction of effort drawn in a per-pattern accent. Question being
// answered: do category illustrations read better at this weight? See variants.prototype.tsx.

import type { MovementPattern } from "@/lib/movement-pattern";

// Per-pattern accent: text colour for the implement/arrow, a declared `-dim` fill for the plate.
// No two neighbours in PATTERN_ORDER share one.
export const PATTERN_ACCENT: Record<MovementPattern, { text: string; plate: string; bar: string }> = {
  squat: { text: "text-cyan", plate: "bg-cyan-dim", bar: "bg-cyan" },
  hinge: { text: "text-violet", plate: "bg-violet-dim", bar: "bg-violet" },
  push: { text: "text-magenta", plate: "bg-magenta-dim", bar: "bg-magenta" },
  pull: { text: "text-amber", plate: "bg-amber-dim", bar: "bg-amber" },
  carry: { text: "text-green", plate: "bg-green-dim", bar: "bg-green" },
  locomotion: { text: "text-cyan", plate: "bg-cyan-dim", bar: "bg-cyan" },
  core: { text: "text-violet", plate: "bg-violet-dim", bar: "bg-violet" },
  general: { text: "text-text-muted", plate: "bg-elevated", bar: "bg-text-muted" },
};

const BODY = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const KIT = { ...BODY, strokeWidth: 3.5 } as const;
const MOTION = { ...BODY, strokeWidth: 2.5, strokeDasharray: "3 4" } as const;
const FLOOR = { ...BODY, strokeWidth: 2, opacity: 0.35 } as const;

function Head({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={5} fill="currentColor" />;
}

function ArrowHead({ x, y, dir }: { x: number; y: number; dir: "up" | "down" | "right" | "left" }) {
  const d = {
    up: `M${x - 4} ${y + 4} L${x} ${y} L${x + 4} ${y + 4}`,
    down: `M${x - 4} ${y - 4} L${x} ${y} L${x + 4} ${y - 4}`,
    right: `M${x - 4} ${y - 4} L${x} ${y} L${x - 4} ${y + 4}`,
    left: `M${x + 4} ${y - 4} L${x} ${y} L${x + 4} ${y + 4}`,
  }[dir];
  return <path d={d} {...BODY} strokeWidth={2.5} />;
}

// Each pose on a 64×64 grid: `body` inherits the plate's ink, `kit` the pattern accent.
const POSES: Record<MovementPattern, { body: React.ReactNode; kit: React.ReactNode }> = {
  squat: {
    body: (
      <>
        <line x1="6" y1="58" x2="58" y2="58" {...FLOOR} />
        <Head x={37} y={13} />
        <polyline points="31,22 20,37 36,40 32,55" {...BODY} />
        <polyline points="31,23 37,27" {...BODY} strokeWidth={4} />
      </>
    ),
    kit: (
      <>
        <circle cx="27" cy="21" r="6.5" {...KIT} />
        <circle cx="27" cy="21" r="1.5" fill="currentColor" />
        <line x1="52" y1="18" x2="52" y2="44" {...MOTION} />
        <ArrowHead x={52} y={16} dir="up" />
        <ArrowHead x={52} y={46} dir="down" />
      </>
    ),
  },
  hinge: {
    body: (
      <>
        <line x1="6" y1="58" x2="58" y2="58" {...FLOOR} />
        <Head x={47} y={20} />
        <polyline points="40,25 22,28 26,42 23,55" {...BODY} />
        <polyline points="39,26 40,40" {...BODY} strokeWidth={4} />
      </>
    ),
    kit: (
      <>
        <circle cx="40" cy="45" r="7" {...KIT} />
        <circle cx="40" cy="45" r="1.5" fill="currentColor" />
        <path d="M14 18 Q6 28 14 38" {...MOTION} />
        <ArrowHead x={15} y={38} dir="right" />
      </>
    ),
  },
  push: {
    body: (
      <>
        <line x1="6" y1="58" x2="58" y2="58" {...FLOOR} />
        <Head x={32} y={22} />
        <line x1="32" y1="30" x2="32" y2="42" {...BODY} />
        <polyline points="26,56 32,42 38,56" {...BODY} />
        <polyline points="21,11 22,22 32,30 42,22 43,11" {...BODY} strokeWidth={4} />
      </>
    ),
    kit: (
      <>
        <line x1="10" y1="10" x2="54" y2="10" {...KIT} />
        <rect x="8" y="4" width="5" height="12" rx="1.5" {...KIT} />
        <rect x="51" y="4" width="5" height="12" rx="1.5" {...KIT} />
        <line x1="56" y1="44" x2="56" y2="26" {...MOTION} />
        <ArrowHead x={56} y={24} dir="up" />
      </>
    ),
  },
  pull: {
    body: (
      <>
        <Head x={32} y={18} />
        <line x1="32" y1="26" x2="32" y2="42" {...BODY} />
        <polyline points="29,57 32,42 35,57" {...BODY} />
        <polyline points="21,9 19,20 32,27 45,20 43,9" {...BODY} strokeWidth={4} />
      </>
    ),
    kit: (
      <>
        <line x1="6" y1="8" x2="58" y2="8" {...KIT} />
        <line x1="56" y1="46" x2="56" y2="26" {...MOTION} />
        <ArrowHead x={56} y={24} dir="up" />
      </>
    ),
  },
  carry: {
    body: (
      <>
        <line x1="6" y1="58" x2="58" y2="58" {...FLOOR} />
        <Head x={32} y={10} />
        <line x1="32" y1="18" x2="31" y2="36" {...BODY} />
        <polyline points="23,56 26,46 31,36 37,46 40,56" {...BODY} />
        <line x1="33" y1="21" x2="43" y2="31" {...BODY} strokeWidth={4} />
      </>
    ),
    kit: (
      <>
        <path d="M41 32 h8 a2 2 0 0 1 2 2 v7 a2 2 0 0 1 -2 2 h-8 a2 2 0 0 1 -2 -2 v-7 a2 2 0 0 1 2 -2 z" {...KIT} />
        <line x1="6" y1="22" x2="16" y2="22" {...MOTION} />
        <line x1="4" y1="30" x2="18" y2="30" {...MOTION} />
        <ArrowHead x={20} y={30} dir="right" />
      </>
    ),
  },
  locomotion: {
    body: (
      <>
        <line x1="6" y1="58" x2="58" y2="58" {...FLOOR} />
        <Head x={40} y={10} />
        <line x1="38" y1="18" x2="33" y2="34" {...BODY} />
        <polyline points="33,34 44,40 41,52" {...BODY} />
        <polyline points="33,34 27,45 16,46" {...BODY} />
        <polyline points="37,21 45,27 50,21" {...BODY} strokeWidth={4} />
        <polyline points="37,21 29,26 25,33" {...BODY} strokeWidth={4} />
      </>
    ),
    kit: (
      <>
        <line x1="4" y1="18" x2="18" y2="18" {...MOTION} />
        <line x1="2" y1="27" x2="20" y2="27" {...MOTION} />
        <line x1="6" y1="36" x2="16" y2="36" {...MOTION} />
      </>
    ),
  },
  core: {
    body: (
      <>
        <line x1="4" y1="52" x2="60" y2="52" {...FLOOR} />
        <Head x={10} y={33} />
        <polyline points="26,48 18,48 18,38 56,46" {...BODY} />
      </>
    ),
    kit: (
      <>
        <circle cx="44" cy="18" r="9" {...KIT} />
        <line x1="44" y1="18" x2="44" y2="12" {...KIT} strokeWidth={2.5} />
        <line x1="44" y1="18" x2="48" y2="20" {...KIT} strokeWidth={2.5} />
        <line x1="41" y1="6" x2="47" y2="6" {...KIT} strokeWidth={2.5} />
      </>
    ),
  },
  general: {
    body: (
      <>
        <line x1="6" y1="58" x2="58" y2="58" {...FLOOR} />
        <Head x={32} y={12} />
        <line x1="32" y1="20" x2="32" y2="36" {...BODY} />
        <polyline points="22,56 32,36 42,56" {...BODY} />
        <polyline points="17,10 32,23 47,10" {...BODY} strokeWidth={4} />
      </>
    ),
    kit: (
      <>
        <line x1="8" y1="26" x2="13" y2="26" {...KIT} strokeWidth={2.5} />
        <line x1="51" y1="26" x2="56" y2="26" {...KIT} strokeWidth={2.5} />
        <line x1="10" y1="38" x2="15" y2="42" {...KIT} strokeWidth={2.5} />
        <line x1="54" y1="38" x2="49" y2="42" {...KIT} strokeWidth={2.5} />
      </>
    ),
  },
};

interface PatternPlateProps {
  pattern: MovementPattern;
  className?: string;
  // `true` draws the figure on the tinted plate; `false` gives a bare glyph for tight rows.
  plate?: boolean;
}

export function PatternPlate({ pattern, className, plate = true }: PatternPlateProps) {
  const accent = PATTERN_ACCENT[pattern];
  const svg = (
    <svg viewBox="0 0 64 64" className={plate ? "block h-[78%] w-[78%]" : className} style={plate ? undefined : { flexShrink: 0 }} aria-hidden>
      <g className="text-text-primary">{POSES[pattern].body}</g>
      <g className={accent.text}>{POSES[pattern].kit}</g>
    </svg>
  );
  if (!plate) return svg;
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl ${accent.plate} ${className ?? ""}`}>
      {svg}
    </span>
  );
}
