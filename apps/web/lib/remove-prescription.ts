import type { ExercisePrescription } from "./sessions-types";

// The per-row Remove affordance for a standalone Session's prescriptions (Remove, ADR-0052)
// — Insert's symmetric partner. Pure view-model so the Session page stays thin and the
// gating rules are unit-testable without a browser (the frontend's logic lives in `lib/`).

export interface RemoveAffordance {
  // Whether to render the Remove control at all. Remove is standalone-only, so it is
  // withheld on a Protocol member — removing inside a Protocol stays the Builder's Deploy
  // path (ADR-0052).
  showRemove: boolean;
  // Whether the control is enabled. `false` on the last remaining movement: a Session must
  // keep at least one, so the control shows disabled with a hint and the server 422 is the
  // backstop (Q4/Q8).
  canRemove: boolean;
  // Whether removing this prescription dissolves a Superset partner: `true` when it is one
  // of exactly two members of a Superset, so the confirm names the consequence — the lone
  // survivor becomes a solo exercise (Q5/Q9). A three-plus-member group merely shrinks.
  dissolvesSuperset: boolean;
}

// Map a standalone Session's prescriptions to their per-row Remove affordances, aligned to
// the input order. `showRemove`/`canRemove` are Session-wide facts (protocol membership and
// how many movements remain); `dissolvesSuperset` is per prescription, read off the Superset
// group sizes across the Session.
export function removeAffordances(
  prescriptions: Pick<ExercisePrescription, "superset_group">[],
  isProtocolMember: boolean,
): RemoveAffordance[] {
  const groupSizes = new Map<string, number>();
  for (const prescription of prescriptions) {
    const group = prescription.superset_group;
    if (group != null) {
      groupSizes.set(group, (groupSizes.get(group) ?? 0) + 1);
    }
  }

  const showRemove = !isProtocolMember;
  const canRemove = prescriptions.length > 1;

  return prescriptions.map((prescription) => ({
    showRemove,
    canRemove,
    dissolvesSuperset:
      prescription.superset_group != null &&
      groupSizes.get(prescription.superset_group) === 2,
  }));
}
