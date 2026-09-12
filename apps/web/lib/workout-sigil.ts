// The Workout Signature engine (CONTEXT: Workout Signature). A pure, browser-safe,
// deterministic mapping from a Session's stable identity to a geometric "sigil" — a base
// polygon plus a constellation of nodes — so every Session renders one recognizable mark that
// is identical on every surface it appears on (Home hero, My Sessions, Train, Session detail).
//
// Cross-surface stability is the whole point, so the seed is the Session **id** alone — the one
// identifier present on every surface (the My Sessions list payload carries no exercise names).
// The node count comes from the Exercise count, which every surface does carry. Two Sessions
// with different ids therefore get different sigils (so the two "Calisthenics" library entries
// never collide), and re-running the same Session reproduces its sigil byte-for-byte.
//
// No I/O and no server-only imports, so both Server and Client Components use it and it is
// unit-tested in isolation.

// The sigil is drawn in a fixed square coordinate space; callers scale it to any pixel size.
export const SIGIL_VIEWBOX = 100;

// The visual node count is capped so a long circuit stays a legible constellation rather than a
// blur of dots; below the cap the node count equals the Exercise count exactly.
export const MIN_SIGIL_NODES = 1;
export const MAX_SIGIL_NODES = 8;

// 32-bit FNV-1a over a string — small, fast, dependency-free, good enough for decorative art.
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// A deterministic float in [0, 1) for a seed + salt. The salt keeps each visual dimension
// (rotation, polygon, each node radius) drawing its own reproducible value without correlating.
function seededUnit(seed: string, salt: string): number {
  return fnv1a(`${seed}::${salt}`) / 0x100000000;
}

// A point in the 0–100 sigil coordinate space.
export interface SigilPoint {
  x: number;
  y: number;
}

// One constellation node — a filled dot joined to its neighbours in order.
export interface SigilNode extends SigilPoint {
  r: number;
}

// The fully-resolved geometry a renderer needs. Pure data, so it is trivially testable.
export interface WorkoutSigilGeometry {
  // Whole-figure rotation in degrees, applied about the centre.
  rotation: number;
  // The faint base polygon (3–6 sides).
  polygon: SigilPoint[];
  // The constellation nodes, in order (the polyline joins them along this order).
  nodes: SigilNode[];
  // The centre point (a small anchor dot).
  center: SigilPoint;
}

// Clamp the Exercise count to the drawable node range. A Session always has at least one
// Exercise in practice, but a zero/negative count is coerced to the floor rather than throwing.
export function sigilNodeCount(exerciseCount: number): number {
  if (!Number.isFinite(exerciseCount)) return MIN_SIGIL_NODES;
  return Math.max(MIN_SIGIL_NODES, Math.min(MAX_SIGIL_NODES, Math.trunc(exerciseCount)));
}

// Build the deterministic sigil geometry for a Session. `seedId` is the Session's stable id;
// `exerciseCount` drives the node count (clamped to [MIN, MAX]).
export function computeSigilGeometry(
  seedId: number | string,
  exerciseCount: number,
): WorkoutSigilGeometry {
  const seed = String(seedId);
  const center: SigilPoint = { x: 50, y: 50 };
  const rotation = seededUnit(seed, "rotation") * 360;
  const sides = 3 + Math.floor(seededUnit(seed, "polygon") * 4); // 3..6
  const baseRadius = 40;

  const polygon: SigilPoint[] = Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * 2 * Math.PI - Math.PI / 2;
    return {
      x: center.x + baseRadius * Math.cos(angle),
      y: center.y + baseRadius * Math.sin(angle),
    };
  });

  const count = sigilNodeCount(exerciseCount);
  const nodes: SigilNode[] = Array.from({ length: count }, (_, i) => {
    const weight = seededUnit(seed, `node:${i}`);
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    const radius = 14 + weight * 26;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
      r: 2.5 + weight * 4,
    };
  });

  return { rotation, polygon, nodes, center };
}
