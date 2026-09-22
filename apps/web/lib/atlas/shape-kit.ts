// Parametric shape generators for the anatomical Muscle Atlas artwork (issue #542).
//
// The atlas authors each muscle as one or more closed `Point[]` rings on the canonical body, which
// `atlas-geometry.smoothClosedPath` then rounds into an organic belly. Rather than hand-place every
// vertex, muscles are composed from a few primitives here so the artwork reads as tapered,
// anatomically-shaped muscle bellies (pointed at the tendon, fat at the belly) instead of plain
// blobs — and stays **original** geometry, described by shape, never traced from another asset.
//
// Pure and dependency-light: every generator returns canonical-body `Point[]` (viewer's-left for a
// bilateral muscle), authored once and warped/mirrored downstream like any other spec ring.

import type { Point } from "./atlas-geometry.ts";

// One cross-section of a muscle belly down its length: `t` is 0 (top) → 1 (bottom), `halfWidth`
// the belly half-thickness there, and optional `offset` shifts that section's centre-line off the
// muscle's axis (so a muscle can lean or curve — sartorius crossing the thigh, a curved oblique).
export type Section = readonly [t: number, halfWidth: number, offset?: number];

// Drop points that land essentially on top of the previous one, so a belly that tapers to a point
// (halfWidth 0 at a tip) doesn't emit a degenerate zero-length spline segment.
function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.5) out.push(p);
  }
  // The ring is closed by the consumer, so also drop a last point coincident with the first.
  if (out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 0.5) out.pop();
  }
  return out;
}

// A tapered muscle belly: a spindle from `top` to `bottom` about the vertical line x=`cx`, whose
// half-width (and optional centre offset) follows `profile` down its length. The ring runs down the
// right edge then back up the left, so the smoothed path hugs a fat belly and narrows to its
// tendons. Author viewer's-left (cx < midline) for a bilateral muscle.
export function belly(cx: number, top: number, bottom: number, profile: readonly Section[]): Point[] {
  const span = bottom - top;
  const right: Point[] = [];
  const left: Point[] = [];
  for (const [t, halfWidth, offset = 0] of profile) {
    const y = top + span * t;
    const axis = cx + offset;
    right.push([axis + halfWidth, y]);
    left.push([axis - halfWidth, y]);
  }
  return dedupe([...right, ...left.reverse()]);
}

// A rounded oval (delts cap, glute mass, small deep muscles). `n` points around the ellipse.
export function oval(cx: number, cy: number, rx: number, ry: number, n = 12): Point[] {
  return Array.from({ length: n }, (_, i): Point => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
  });
}

// A rounded quadrilateral from four corners (pec slab, lat wing, trap diamond): corners are given
// clockwise; the smoothing rounds them. A thin convenience over an explicit ring.
export function slab(corners: readonly Point[]): Point[] {
  return corners.map(([x, y]): Point => [x, y]);
}
