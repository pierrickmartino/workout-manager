// Shared geometry for the anatomical Muscle Atlas assets (issue #542).
//
// The atlas ships three figures — a neutral/androgynous fallback, a male, and a female — each
// with a front and a back view, drawn on one coordinate system so a single figure-agnostic
// muscle-id contract holds across all of them (issue #542). The muscle artwork is authored
// **once** (see `muscle-figure-spec.ts`) on a canonical body and then *warped* per figure by a
// small set of proportion knobs, so the three bodies read differently without ever forking the
// muscle→id mapping. This module holds the pure geometry primitives that both the generator
// (`scripts/generate-atlas.mts`) and the asset tests read, so the artwork and its validation can
// never disagree on how a point becomes a path.

// The one coordinate system every figure and view is drawn in. Wide enough for the arms to sit
// clear of the torso; tall enough for a head-to-ankle figure. The body is symmetric about
// `CENTER_X`, which every mirror and warp pivots on.
export const VIEW_BOX = "0 0 220 640";
export const CENTER_X = 110;

export const VIEWS = ["front", "back"] as const;
export type View = (typeof VIEWS)[number];

export const FIGURES = ["neutral", "male", "female"] as const;
export type Figure = (typeof FIGURES)[number];

// Which side of the body a drawn shape sits on, from the *viewer's* perspective (left = the
// image's left, x < CENTER_X). A midline muscle that is drawn once, straddling the spine, is
// `center`. The side is a property of the canonical artwork, so it is the same across all three
// figures — the manifest records it once.
export type Side = "left" | "right" | "center";

export type Point = readonly [number, number];

// How a muscle is laid out about the midline. `bilateral` is authored once on the viewer's-left
// and mirrored to the right, so the two halves can never drift apart; `center` is a single
// midline shape (e.g. the deep spinal muscles) drawn as authored.
export type Symmetry = "bilateral" | "center";

// Per-figure horizontal proportion knobs. Each is a multiplier on a point's distance from the
// midline within a vertical band of the body, so widening the shoulders or the hips carries the
// muscles sitting in that band along with the silhouette — the muscles stay anatomically placed
// on whichever body they are warped onto. 1.0 is the canonical (neutral) width.
interface FigureProportions {
  shoulders: number; // upper torso / deltoid band
  waist: number; // abdomen band
  hips: number; // pelvis / glute band
  legs: number; // thigh-and-below band
}

const PROPORTIONS: Record<Figure, FigureProportions> = {
  // The canonical body: every knob 1.0, so the neutral figure is the artwork exactly as authored.
  neutral: { shoulders: 1.0, waist: 1.0, hips: 1.0, legs: 1.0 },
  // Broader shoulders and chest, a slightly narrower waist, hips a touch in — a stereotypically
  // masculine V-taper, kept subtle so it reads as a proportion, not a caricature.
  male: { shoulders: 1.12, waist: 0.97, hips: 0.95, legs: 1.0 },
  // Narrower shoulders, a drawn-in waist, wider hips — a stereotypically feminine silhouette,
  // again kept subtle. The muscle-id contract is identical to the other two figures.
  female: { shoulders: 0.93, waist: 0.9, hips: 1.13, legs: 1.03 },
};

// The vertical bands the proportion knobs act on, top (smaller y) to bottom. A point's width
// factor is interpolated between the band centres it falls between, so the silhouette flows
// smoothly from shoulders to waist to hips rather than stepping at a seam.
const BANDS: { center: number; knob: keyof FigureProportions }[] = [
  { center: 140, knob: "shoulders" },
  { center: 250, knob: "waist" },
  { center: 355, knob: "hips" },
  { center: 520, knob: "legs" },
];

// The horizontal width factor for a given y on a given figure: the proportion knob of the band a
// point sits in, linearly interpolated toward the neighbouring band so there is no hard edge.
// Above the first band centre or below the last, it clamps to that band's knob.
function widthFactor(y: number, figure: Figure): number {
  const knobs = PROPORTIONS[figure];
  if (y <= BANDS[0].center) return knobs[BANDS[0].knob];
  const last = BANDS[BANDS.length - 1];
  if (y >= last.center) return knobs[last.knob];
  for (let i = 0; i < BANDS.length - 1; i += 1) {
    const lo = BANDS[i];
    const hi = BANDS[i + 1];
    if (y >= lo.center && y <= hi.center) {
      const t = (y - lo.center) / (hi.center - lo.center);
      return knobs[lo.knob] * (1 - t) + knobs[hi.knob] * t;
    }
  }
  return 1.0;
}

// Warp one canonical point onto a figure: scale its distance from the midline by the width factor
// for its height, leaving y untouched. Pure — returns a new point.
export function warpPoint(point: Point, figure: Figure): Point {
  const [x, y] = point;
  const factor = widthFactor(y, figure);
  return [CENTER_X + (x - CENTER_X) * factor, y];
}

// Mirror a point across the midline — the one operation that turns an authored viewer's-left
// shape into its right-hand twin, so a bilateral muscle is drawn from a single source of truth.
export function mirrorPoint(point: Point): Point {
  return [2 * CENTER_X - point[0], point[1]];
}

export function mirrorPoints(points: readonly Point[]): Point[] {
  return points.map(mirrorPoint);
}

// The viewer-side a set of points sits on, from its average x: left of the midline, right of it,
// or centred (within a small tolerance, for a midline shape). Read off the *canonical* artwork so
// the answer is figure-independent.
export function sideOf(points: readonly Point[]): Side {
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
  if (meanX < CENTER_X - 1) return "left";
  if (meanX > CENTER_X + 1) return "right";
  return "center";
}

function round(value: number): number {
  // Two decimals keeps the paths compact yet smooth; trailing-zero noise is stripped by Number.
  return Number(value.toFixed(2));
}

// Turn a ring of points into a closed, smooth SVG path via a Catmull-Rom spline expressed as
// cubic Béziers, so an organically-shaped muscle reads as a rounded blob rather than a faceted
// polygon. A degenerate ring (< 3 points) falls back to straight segments. Pure.
export function smoothClosedPath(points: readonly Point[]): string {
  const n = points.length;
  if (n < 3) {
    const line = points.map(([x, y]) => `${round(x)} ${round(y)}`).join(" L ");
    return `M ${line} Z`;
  }
  const at = (i: number): Point => points[((i % n) + n) % n];
  let d = `M ${round(points[0][0])} ${round(points[0][1])}`;
  for (let i = 0; i < n; i += 1) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(x2)} ${round(y2)}`;
  }
  return `${d} Z`;
}

// The silhouette the muscles are drawn on: a set of body-part blobs (head, neck, torso, arms,
// legs) filled with the figure-fill token. Authored on the canonical body and warped per figure
// like the muscles, so the outline and the muscles taper together. The back view reuses the same
// silhouette — the difference between front and back is the muscles, not the outline.
const SILHOUETTE: Point[][] = [
  // Neck
  [
    [99, 74],
    [121, 74],
    [122, 104],
    [98, 104],
  ],
  // Torso: shoulders down to the hips, gently waisted
  [
    [61, 118],
    [159, 118],
    [156, 176],
    [150, 250],
    [146, 322],
    [74, 322],
    [70, 250],
    [64, 176],
  ],
  // Left arm
  [
    [44, 122],
    [67, 128],
    [60, 250],
    [52, 350],
    [36, 348],
    [40, 250],
  ],
  // Right arm (mirror of the left)
  [
    [176, 122],
    [153, 128],
    [160, 250],
    [168, 350],
    [184, 348],
    [180, 250],
  ],
  // Left leg
  [
    [74, 322],
    [107, 322],
    [104, 470],
    [98, 616],
    [80, 616],
    [78, 470],
  ],
  // Right leg (mirror of the left)
  [
    [146, 322],
    [113, 322],
    [116, 470],
    [122, 616],
    [140, 616],
    [142, 470],
  ],
];

// The head, drawn as a circle so the figure reads as a body at a glance; warped in x with the
// shoulders band so it sits proportionally on each figure.
const HEAD = { cx: 110, cy: 46, r: 30 } as const;

// Build the silhouette markup for one figure: the head plus each warped body-part blob, all
// filled with the themeable figure tokens. Marked `aria-hidden` and carrying no muscle id, so it
// is never mistaken for an addressable muscle path by a consumer or a test.
export function silhouetteMarkup(figure: Figure): string {
  const head = warpPoint([HEAD.cx, HEAD.cy], figure);
  const parts = SILHOUETTE.map((ring) => {
    const d = smoothClosedPath(ring.map((point) => warpPoint(point, figure)));
    return `    <path class="atlas-figure" d="${d}" />`;
  });
  return [
    `    <circle class="atlas-figure" cx="${round(head[0])}" cy="${round(head[1])}" r="${HEAD.r}" />`,
    ...parts,
  ].join("\n");
}

// The theme contract, embedded in every asset so a standalone open of the .svg renders correctly
// in both light and dark, while an app that inlines the SVG can override any token. Fills and
// strokes are *only* ever `var(--atlas-*)` — no muscle path carries a literal color — so heat and
// light/dark theming are driven entirely by the caller's custom properties (issue #542 AC).
export const STYLE_BLOCK = `  <style>
    svg {
      --atlas-figure-fill: #e2e8f0;
      --atlas-figure-stroke: #cbd5e1;
      --atlas-muscle-fill: #cbd5e1;
      --atlas-muscle-stroke: #94a3b8;
    }
    @media (prefers-color-scheme: dark) {
      svg {
        --atlas-figure-fill: #1e293b;
        --atlas-figure-stroke: #334155;
        --atlas-muscle-fill: #334155;
        --atlas-muscle-stroke: #475569;
      }
    }
    .atlas-figure { fill: var(--atlas-figure-fill); stroke: var(--atlas-figure-stroke); stroke-width: 1; }
    .atlas-muscle { fill: var(--atlas-muscle-fill); stroke: var(--atlas-muscle-stroke); stroke-width: 0.75; }
  </style>`;
