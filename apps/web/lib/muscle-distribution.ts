import type { MuscleShare } from "./analytics-types";

// A muscle share prepared for rendering: a rounded whole-percent `label` for the
// eye and the raw `width` (0–100) for the bar fill, so labels can round without
// the bars drifting out of proportion.
export interface MuscleBar {
  group: string;
  label: string;
  width: number;
}

// Turn the API's exact-float muscle shares into display rows, preserving the
// read model's canonical group order. Pure and server-free so it is safe to use
// from either a Server or Client Component.
export function toMuscleBars(shares: readonly MuscleShare[]): MuscleBar[] {
  return shares.map((share) => ({
    group: share.group,
    label: `${Math.round(share.pct)}%`,
    width: share.pct,
  }));
}
