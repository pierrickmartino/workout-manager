// The Stamp art engine (#654): a pure, deterministic mapping from an Achievement to the
// geometric illustration its Stamp wears in the Training Passport (ADR-0126). A sibling of the
// workout sigil (`workout-sigil.ts`): plain geometry in a fixed square space, no dependency, no
// randomness, so the same Achievement draws the same Stamp on every surface.
//
// Family is carried by the silhouette, so the families stay distinguishable without colour:
// session counts are a circle, week streaks a hexagon, muscle coverage a square, and the record
// a notch-starred circle. Tier is carried by the inner rings (sessions: 1 / 5 / 25 / 100) or by
// one segment per week (streaks: 4 / 12). State changes only the treatment — an earned Stamp is
// filled ink, the next milestone a muted outline — never the structure. The art is decorative;
// the text beside it carries the meaning.
//
// No I/O and no server-only imports, so Server Components use it and it is unit-tested alone.

export const STAMP_VIEWBOX = 100;

export type StampFamily = "sessions" | "streak" | "coverage" | "record";

// An earned Stamp, or the outline of one not earned yet (the next milestone, or any locked
// Achievement's page).
export type StampState = "earned" | "next";

// Earned Stamps wear the Training Atlas teal ink; the violet milestone accent is reserved for
// the record Stamp. Every outline is muted. Each is an existing Skin token, already measured
// against every surface in every Skin and Mode (ADR-0081).
export type StampAccent = "cyan" | "violet" | "muted";

export interface StampDesign {
  family: StampFamily;
  // 1-based within the family; a higher tier draws more elaborately.
  tier: number;
}

export interface StampPoint {
  x: number;
  y: number;
}

export type SilhouetteKind = "circle" | "hexagon" | "square" | "notched-circle";

export interface StampSilhouette {
  kind: SilhouetteKind;
  // The outer radius: the circle's own, or the polygon's circumradius.
  radius: number;
  // The outline's vertices; empty for a plain circle.
  points: StampPoint[];
}

// A radial tick: one per week on a streak Stamp.
export interface StampSegment {
  from: StampPoint;
  to: StampPoint;
}

export interface StampGeometry {
  silhouette: StampSilhouette;
  // Concentric inner ring radii, outermost first.
  rings: number[];
  segments: StampSegment[];
  accent: StampAccent;
  // Filled ink (earned) or an outline (next).
  filled: boolean;
}

// The curated catalog (`apps/api/app/domain/achievements.py`), each Achievement a distinct
// (family, tier). An id outside it has no design, so a newly added Achievement renders its text
// without art until it is given one here — never a borrowed, misleading Stamp.
const STAMP_DESIGNS: Readonly<Record<string, StampDesign>> = {
  "sessions-1": { family: "sessions", tier: 1 },
  "sessions-5": { family: "sessions", tier: 2 },
  "sessions-25": { family: "sessions", tier: 3 },
  "sessions-100": { family: "sessions", tier: 4 },
  "streak-4": { family: "streak", tier: 1 },
  "streak-12": { family: "streak", tier: 2 },
  "muscle-all": { family: "coverage", tier: 1 },
  "first-pr": { family: "record", tier: 1 },
};

export function stampDesign(achievementId: string): StampDesign | null {
  return Object.hasOwn(STAMP_DESIGNS, achievementId) ? STAMP_DESIGNS[achievementId] : null;
}

const SILHOUETTES: Readonly<Record<StampFamily, SilhouetteKind>> = {
  sessions: "circle",
  streak: "hexagon",
  coverage: "square",
  record: "notched-circle",
};

// The weeks each streak tier counts, so the Stamp carries one segment per week.
const STREAK_WEEKS: readonly number[] = [4, 12];

const CENTER: StampPoint = { x: 50, y: 50 };
const OUTER_RADIUS = 44;
// The notch-starred circle alternates between the outer radius and this inner one.
const NOTCH_RADIUS = 39;
const NOTCH_COUNT = 16;
// Session rings step inward from just inside the silhouette.
const FIRST_RING_RADIUS = 34;
const RING_STEP = 7;
// Every family but sessions shows its tier another way, so it carries a single ring.
const SINGLE_RING_RADIUS = 22;
const SEGMENT_INNER_RADIUS = 27;
const SEGMENT_OUTER_RADIUS = 35;

// A point at `radius` from the centre, `turn` of the way round, starting at the top.
function polar(radius: number, turn: number): StampPoint {
  const angle = turn * 2 * Math.PI - Math.PI / 2;
  return { x: CENTER.x + radius * Math.cos(angle), y: CENTER.y + radius * Math.sin(angle) };
}

function regularPolygon(sides: number, radius: number, offset = 0): StampPoint[] {
  return Array.from({ length: sides }, (_, i) => polar(radius, (i + offset) / sides));
}

function silhouette(kind: SilhouetteKind): StampSilhouette {
  switch (kind) {
    case "circle":
      return { kind, radius: OUTER_RADIUS, points: [] };
    case "hexagon":
      return { kind, radius: OUTER_RADIUS, points: regularPolygon(6, OUTER_RADIUS) };
    case "square":
      // Turned an eighth so it sits flat rather than on a corner.
      return { kind, radius: OUTER_RADIUS, points: regularPolygon(4, OUTER_RADIUS, 0.5) };
    case "notched-circle":
      return {
        kind,
        radius: OUTER_RADIUS,
        points: Array.from({ length: NOTCH_COUNT * 2 }, (_, i) =>
          polar(i % 2 === 0 ? OUTER_RADIUS : NOTCH_RADIUS, i / (NOTCH_COUNT * 2)),
        ),
      };
  }
}

function rings({ family, tier }: StampDesign): number[] {
  if (family !== "sessions") {
    return [SINGLE_RING_RADIUS];
  }
  return Array.from({ length: Math.max(1, tier) }, (_, i) => FIRST_RING_RADIUS - i * RING_STEP);
}

function segments({ family, tier }: StampDesign): StampSegment[] {
  if (family !== "streak") {
    return [];
  }
  const weeks = STREAK_WEEKS[tier - 1] ?? STREAK_WEEKS[STREAK_WEEKS.length - 1];
  return Array.from({ length: weeks }, (_, i) => ({
    from: polar(SEGMENT_INNER_RADIUS, i / weeks),
    to: polar(SEGMENT_OUTER_RADIUS, i / weeks),
  }));
}

function accent(family: StampFamily, state: StampState): StampAccent {
  if (state === "next") {
    return "muted";
  }
  return family === "record" ? "violet" : "cyan";
}

export function computeStampGeometry(design: StampDesign, state: StampState): StampGeometry {
  return {
    silhouette: silhouette(SILHOUETTES[design.family]),
    rings: rings(design),
    segments: segments(design),
    accent: accent(design.family, state),
    filled: state === "earned",
  };
}
