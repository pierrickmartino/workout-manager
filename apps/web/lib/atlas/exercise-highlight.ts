// Pure view-model for the single-exercise Muscle Atlas highlight (issue #544).
//
// The Exercise Detail screen reuses the anatomical figure (issue #542) to show, at a glance, which
// muscles one exercise trains — primary hot, secondary warm. The backend resolves the Exercise's
// own free-form Primary/Secondary muscles into canonical Muscles via `classify_muscle` (#539),
// leaving a bare region term ("core") as a coarse *group* for the figure to spread. This module is
// the frontend seam that turns that resolved highlight into per-muscle fill for the figure and the
// text lists that name the highlighted muscles — so nothing rides on the illustration or color. It
// shares the SVG asset and the canonical mapping, **not** the aggregate coverage read: there is no
// windowed heat here, just a fixed two-level emphasis. Pure and server-free (no DOM, no fetch), so
// it is unit-testable with `node --test` and safe from either a Server or Client Component.

import type { ExerciseMuscleHighlight, EmphasisHighlight } from "../sessions-types.ts";
import { MUSCLE_SPECS } from "./muscle-figure-spec.ts";

// The two-level highlight encoding: a primary (prime mover) muscle reads hot, a secondary
// (assistor) a lighter warm. Named, not magic — the one knob this fixed encoding exposes, kept
// well clear of a coverage-style gradient so the two surfaces never look alike.
export const HIGHLIGHT_PRIMARY_OPACITY = 0.9;
export const HIGHLIGHT_SECONDARY_OPACITY = 0.42;

export type HighlightEmphasis = "primary" | "secondary";

// The canonical muscle order and muscle→group nesting, derived once from the shared figure spec —
// the frontend's single copy of the #539 vocabulary, cross-checked against the Python
// `MUSCLE_ORDER`/`MUSCLES_IN_GROUP` by `test_atlas_muscle_contract.py`, so this can never drift
// from the source of truth the backend resolves against.
const MUSCLE_ORDER: string[] = MUSCLE_SPECS.map((spec) => spec.id);
const MUSCLE_IDS: Set<string> = new Set(MUSCLE_ORDER);
const GROUP_OF: Map<string, string> = new Map(
  MUSCLE_SPECS.map((spec) => [spec.id, spec.group]),
);

// Each Muscle Group's muscles in canonical order — the roster a coarse group-level term spreads
// its highlight across, so a covered group is never a sea of grey (the same spread rule the atlas
// coverage read applies, here on the frontend from the group nesting it already carries).
export const MUSCLES_IN_GROUP: Map<string, string[]> = (() => {
  const byGroup = new Map<string, string[]>();
  for (const spec of MUSCLE_SPECS) {
    const list = byGroup.get(spec.group);
    if (list) {
      list.push(spec.id);
    } else {
      byGroup.set(spec.group, [spec.id]);
    }
  }
  return byGroup;
})();

// One canonical Muscle prepared for the figure: its `muscle` id and parent `group` (for the group
// hue), the `emphasis` lane it lights in, and the `opacity` that lane fills at.
export interface MuscleHighlight {
  muscle: string;
  group: string;
  emphasis: HighlightEmphasis;
  opacity: number;
}

// The resolved single-exercise highlight: `byMuscle` drives the figure (only lit muscles are
// present), `primaryMuscles`/`secondaryMuscles` name the highlighted muscles in canonical order
// for the accessible text list, and `isEmpty` is true only when nothing landed on the map (all
// off-map) — the signal for the caller to fall back to the free-form muscle text.
export interface ExerciseHighlightView {
  byMuscle: Map<string, MuscleHighlight>;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  isEmpty: boolean;
}

// The fill opacity for an emphasis lane — the one place the two-level encoding is read.
export function highlightOpacity(emphasis: HighlightEmphasis): number {
  return emphasis === "primary" ? HIGHLIGHT_PRIMARY_OPACITY : HIGHLIGHT_SECONDARY_OPACITY;
}

// Assign one emphasis lane's targets onto the working map: each specific muscle lights directly,
// and each coarse group spreads across every muscle nested under it. An unknown id (never emitted
// by the contract-checked backend) is dropped so the highlight never names a muscle with no path.
function assignLane(
  target: Map<string, HighlightEmphasis>,
  lane: EmphasisHighlight,
  emphasis: HighlightEmphasis,
): void {
  for (const muscle of lane.muscles) {
    if (MUSCLE_IDS.has(muscle)) target.set(muscle, emphasis);
  }
  for (const group of lane.groups) {
    for (const muscle of MUSCLES_IN_GROUP.get(group) ?? []) {
      target.set(muscle, emphasis);
    }
  }
}

// Resolve the server-side highlight into the figure model and text lists. Secondary is assigned
// first and primary second, so a muscle claimed by both lanes (e.g. a specific primary that also
// falls inside a coarse secondary group) settles as **primary** — the stronger claim wins. The
// output is re-ordered to the canonical muscle order, so the figure and the text agree with every
// other atlas surface regardless of the order the muscles arrived in.
export function toExerciseHighlight(
  highlight: ExerciseMuscleHighlight,
): ExerciseHighlightView {
  const emphasisByMuscle = new Map<string, HighlightEmphasis>();
  assignLane(emphasisByMuscle, highlight.secondary, "secondary");
  assignLane(emphasisByMuscle, highlight.primary, "primary");

  const byMuscle = new Map<string, MuscleHighlight>();
  const primaryMuscles: string[] = [];
  const secondaryMuscles: string[] = [];
  for (const muscle of MUSCLE_ORDER) {
    const emphasis = emphasisByMuscle.get(muscle);
    if (!emphasis) continue;
    byMuscle.set(muscle, {
      muscle,
      group: GROUP_OF.get(muscle) ?? "",
      emphasis,
      opacity: highlightOpacity(emphasis),
    });
    if (emphasis === "primary") {
      primaryMuscles.push(muscle);
    } else {
      secondaryMuscles.push(muscle);
    }
  }

  return {
    byMuscle,
    primaryMuscles,
    secondaryMuscles,
    isEmpty: byMuscle.size === 0,
  };
}
