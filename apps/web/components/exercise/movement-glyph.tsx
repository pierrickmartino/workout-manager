// Original pictograms for the field-guide Movement Pattern taxonomy (ADR-0072), one per broad
// pattern. A deliberately small, consistent set — visual variety across the whole Catalog
// without a bespoke drawing per movement. Each is a bold figure (thick round strokes, a filled
// head) caught mid-pattern on a common 64×64 grid, so it still reads at the 40px jump-strip
// size. Two inks: the figure in `currentColor`, so it inherits its host's ink, and the
// implement plus the direction of effort in the pattern's accent (`PATTERN_ACCENT`). Both
// re-theme under every Skin. `general` is the neutral bucket, shown when the backend asserts
// no specific pattern.

import { PATTERN_ACCENT, type MovementPattern } from "@/lib/movement-pattern";

interface MovementGlyphProps {
  pattern: MovementPattern;
  className?: string;
  // Decorative by default (the section label carries the meaning); pass a title to
  // announce it to assistive tech (e.g. the detail hero).
  title?: string;
}

const BODY = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

// Arms are a touch thinner than the trunk and legs, so the pose reads at small sizes.
const ARM = { ...BODY, strokeWidth: 4 } as const;
const KIT = { ...BODY, strokeWidth: 3.5 } as const;
const MOTION = { ...BODY, strokeWidth: 2.5, strokeDasharray: "3 4" } as const;
const FLOOR = { ...BODY, strokeWidth: 2, strokeOpacity: 0.35 } as const;

const HEAD_R = 5;

type Direction = "up" | "down" | "right";

const ARROW_HEADS: Record<Direction, (x: number, y: number) => string> = {
  up: (x, y) => `M${x - 4} ${y + 4} L${x} ${y} L${x + 4} ${y + 4}`,
  down: (x, y) => `M${x - 4} ${y - 4} L${x} ${y} L${x + 4} ${y - 4}`,
  right: (x, y) => `M${x - 4} ${y - 4} L${x} ${y} L${x - 4} ${y + 4}`,
};

function ArrowHead({ x, y, dir }: { x: number; y: number; dir: Direction }) {
  return <path d={ARROW_HEADS[dir](x, y)} {...MOTION} strokeDasharray="none" />;
}

function Head({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={HEAD_R} fill="currentColor" />;
}

function Floor({ y = 58 }: { y?: number }) {
  return <line x1="6" y1={y} x2="58" y2={y} {...FLOOR} />;
}

interface Pose {
  figure: React.JSX.Element;
  kit: React.JSX.Element;
}

// Each pattern's pose: `figure` is the body, `kit` the implement and the motion cue.
const POSES: Record<MovementPattern, Pose> = {
  squat: {
    figure: (
      <>
        <Floor />
        <Head x={37} y={13} />
        <polyline points="31,22 20,37 36,40 32,55" {...BODY} />
        <polyline points="31,23 37,27" {...ARM} />
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
    figure: (
      <>
        <Floor />
        <Head x={47} y={20} />
        <polyline points="40,25 22,28 26,42 23,55" {...BODY} />
        <polyline points="39,26 40,40" {...ARM} />
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
    figure: (
      <>
        <Floor />
        <Head x={32} y={22} />
        <line x1="32" y1="30" x2="32" y2="42" {...BODY} />
        <polyline points="26,56 32,42 38,56" {...BODY} />
        <polyline points="21,11 22,22 32,30 42,22 43,11" {...ARM} />
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
    figure: (
      <>
        <Head x={32} y={18} />
        <line x1="32" y1="26" x2="32" y2="42" {...BODY} />
        <polyline points="29,57 32,42 35,57" {...BODY} />
        <polyline points="21,9 19,20 32,27 45,20 43,9" {...ARM} />
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
    figure: (
      <>
        <Floor />
        <Head x={32} y={10} />
        <line x1="32" y1="18" x2="31" y2="36" {...BODY} />
        <polyline points="23,56 26,46 31,36 37,46 40,56" {...BODY} />
        <line x1="33" y1="21" x2="43" y2="31" {...ARM} />
      </>
    ),
    kit: (
      <>
        <rect x="39" y="32" width="12" height="11" rx="2" {...KIT} />
        <line x1="6" y1="22" x2="16" y2="22" {...MOTION} />
        <line x1="4" y1="30" x2="18" y2="30" {...MOTION} />
        <ArrowHead x={20} y={30} dir="right" />
      </>
    ),
  },
  locomotion: {
    figure: (
      <>
        <Floor />
        <Head x={40} y={10} />
        <line x1="38" y1="18" x2="33" y2="34" {...BODY} />
        <polyline points="33,34 44,40 41,52" {...BODY} />
        <polyline points="33,34 27,45 16,46" {...BODY} />
        <polyline points="37,21 45,27 50,21" {...ARM} />
        <polyline points="37,21 29,26 25,33" {...ARM} />
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
    figure: (
      <>
        <Floor y={52} />
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
    figure: (
      <>
        <Floor />
        <Head x={32} y={12} />
        <line x1="32" y1="20" x2="32" y2="36" {...BODY} />
        <polyline points="22,56 32,36 42,56" {...BODY} />
        <polyline points="17,10 32,23 47,10" {...ARM} />
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

export function MovementGlyph({
  pattern,
  className,
  title,
}: MovementGlyphProps): React.JSX.Element {
  const pose = POSES[pattern];
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {pose.figure}
      <g className={PATTERN_ACCENT[pattern].ink}>{pose.kit}</g>
    </svg>
  );
}

interface MovementPlateProps extends MovementGlyphProps {
  // Sizes the plate (e.g. `h-12 w-12`); the figure fills ~80% of it.
  className?: string;
}

// The glyph on its family's tinted plate — the jump strip and the detail hero. The figure
// takes the primary ink so it holds against every plate in every Skin.
export function MovementPlate({ pattern, className, title }: MovementPlateProps): React.JSX.Element {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl text-text-primary ${PATTERN_ACCENT[pattern].plate} ${className ?? ""}`}
    >
      <MovementGlyph pattern={pattern} title={title} className="h-4/5 w-4/5" />
    </span>
  );
}
