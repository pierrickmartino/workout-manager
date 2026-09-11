// The typed Effort shared across the plan and the record (ADR-0066). Effort is not a bare
// number: its `scale` (RPE or RIR) fixes how its `value` reads, and the cross-scale rendering
// (`rpe ≈ 10 − rir`) is a **read-time projection computed per reader** — the effort
// counterpart of the kg/lb Weight-Unit projection in `weight-format.ts`. Storage keeps the
// scale the user logged; a reader can view the other scale without the stored value changing.
//
// This module has NO server-only imports, so it is safe in both Server and Client Components
// and is unit-testable without a browser. It is the one place RPE turns into RIR and back.

// A user's Effort scale (CONTEXT "Effort"). The frontend mirror of the backend's closed
// `EffortScale` enum in app/domain/effort.py; the two must not drift on which scales exist.
export type EffortScale = "rpe" | "rir";

// The catalog as a runtime tuple: the single source of truth for which scales exist. Kept in
// lockstep with the `EffortScale` union above (mirrors `KNOWN_WEIGHT_UNITS`).
export const KNOWN_EFFORT_SCALES = ["rpe", "rir"] as const;

// The scale a value with no declared scale is read as — the conventional RPE, so an rpe-only
// entry (and the legacy `perceived_difficulty` int) needs no scale. Mirrors the backend
// `DEFAULT_EFFORT_SCALE`.
export const DEFAULT_EFFORT_SCALE: EffortScale = "rpe";

// The wire shape the API serializes for a typed Effort. `value` is an RPE number (0–10,
// half-steps) or an RIR integer (0–5), read per its `scale`.
export interface Effort {
  scale: EffortScale;
  value: number;
}

// The relation the whole module hangs on — `rpe = RPE_MAX − rir` — and the RIR band its
// projection clamps into. Anchored here so the two scales never drift.
const RPE_MAX = 10;
const RIR_MIN = 0;
const RIR_MAX = 5;

// The em dash the UI shows when no Effort was recorded.
export const NO_EFFORT = "—";

// The scale's short display label — "RPE" / "RIR".
export function effortScaleLabel(scale: EffortScale): string {
  return scale.toUpperCase();
}

// Project an Effort to an RPE number: its own value on the RPE scale, or `10 − rir`. The exact
// projection (a half-step survives), the number a reader viewing the RPE scale sees.
export function effortAsRpe(effort: Effort): number {
  return effort.scale === "rpe" ? effort.value : RPE_MAX - effort.value;
}

// Project an Effort to a (possibly fractional) reps-in-reserve number: its own value on the RIR
// scale, or `10 − rpe`. Fractional for a half-step RPE — rounding happens only at the display
// boundary (`projectEffort` / `formatEffort`), the same way the kg/lb projection rounds only
// when rendered.
export function effortAsRir(effort: Effort): number {
  return effort.scale === "rir" ? effort.value : RPE_MAX - effort.value;
}

// Project an Effort into `scale` as a valid Effort — the read-time cross-scale projection.
// Projecting to the same scale returns the input. Projecting to RPE carries the exact value;
// projecting to RIR rounds to the nearest integer and clamps into the 0–5 band, since RIR
// admits only whole members and a "5+" ceiling — so the result is always displayable.
export function projectEffort(effort: Effort, scale: EffortScale): Effort {
  if (effort.scale === scale) return effort;
  if (scale === "rpe") return { scale: "rpe", value: effortAsRpe(effort) };
  const clamped = Math.max(RIR_MIN, Math.min(RIR_MAX, Math.round(effortAsRir(effort))));
  return { scale: "rir", value: clamped };
}

// Read a returning user's legacy `perceived_difficulty` int as an RPE-scale Effort (ADR-0066),
// or null when none was recorded — so a record logged before typed Effort still displays and
// projects, with no backfill. The record-side fallback the display reaches through.
export function effortFromPerceivedDifficulty(
  perceivedDifficulty: number | null | undefined,
): Effort | null {
  return perceivedDifficulty == null ? null : { scale: "rpe", value: perceivedDifficulty };
}

// Render a typed Effort for display, optionally projected into the reader's preferred `scale`
// (default: the scale it was logged in). RPE reads "RPE 7" / "RPE 6.5"; RIR reads "3 RIR" —
// each scale in its conventional word order. Absent Effort falls back to the em dash. This is
// the effort counterpart of `formatLoad`: the display value routes through it, never a re-derived
// string.
export function formatEffort(
  effort: Effort | null | undefined,
  scale?: EffortScale,
): string {
  if (effort == null) return NO_EFFORT;
  const shown = scale ? projectEffort(effort, scale) : effort;
  return shown.scale === "rpe" ? `RPE ${shown.value}` : `${shown.value} RIR`;
}

// The typed Effort a Logged Set carries for display: the stored typed `effort`, else the legacy
// `perceived_difficulty` read as RPE, else null. The one seam the record display reaches an
// effort through, mirroring how the backend `logged_effort_rpe` prefers the typed value and
// falls back to the int.
export function loggedSetEffort(loggedSet: {
  effort?: Effort | null;
  perceived_difficulty: number | null;
}): Effort | null {
  return loggedSet.effort ?? effortFromPerceivedDifficulty(loggedSet.perceived_difficulty);
}
