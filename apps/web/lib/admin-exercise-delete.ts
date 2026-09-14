// Pure logic for the admin guarded hard-delete control (issue #507, ADR-0076). Frontend
// logic lives here per the repo rule so it is unit-testable with `node --test` and the
// component stays thin. No server or React imports.
//
// Hard delete is the narrow, irreversible exception to "catalog membership is never deleted":
// an admin may permanently remove an Exercise **only** when it is already **Retired** *and*
// wholly **unreferenced** (no Exercise Prescription, Logged Set, or Relationship points at
// it) — the retire-then-delete rule. This module mirrors that guard so the control disables
// itself and shows *why*; the backend re-checks on delete and is the real authority (it
// returns 409 if the guard is unmet), so this is a UX affordance, never the gate.

// The complete presentation of the Delete control for the Exercise's current state.
export interface DeleteControlView {
  // Whether the guarded hard delete may be offered — true iff retired ∧ unreferenced.
  canDelete: boolean;
  // Why the control is disabled, shown beside it; `null` exactly when `canDelete` is true.
  blockingReason: string | null;
  // A one-line explanation of the guard, shown whether or not delete is enabled.
  description: string;
  // The action button's resting and in-flight labels.
  actionLabel: string;
  busyLabel: string;
  // The confirmation the admin must accept before the irreversible act fires.
  confirmMessage: string;
  // The message shown after a successful delete.
  successMessage: string;
}

const DESCRIPTION =
  "Permanently deletes this movement from the shared catalog. This is irreversible and is " +
  "allowed only once the exercise is retired and no longer referenced by any prescription, " +
  "logged set, or relationship. Retire hides a movement reversibly; delete does not.";

const CONFIRM_MESSAGE =
  "Permanently delete this exercise? This cannot be undone.";

const SUCCESS_MESSAGE = "Exercise permanently deleted.";

// Render the whole reference count into a human phrase, correctly singular/plural.
function referencePhrase(referenceCount: number): string {
  const noun = referenceCount === 1 ? "reference" : "references";
  return `${referenceCount} ${noun}`;
}

// Project the Exercise's retired flag and reference count onto the control's copy and
// enablement (ADR-0076). Pure: it derives labels only and never mutates its input. The
// enablement mirrors the backend's `can_hard_delete` — retired ∧ zero references — and the
// blocking reason walks the guard in order (retire first, then references) so the admin is
// told the single next step rather than every unmet condition at once. `referenceCount` is
// `null` when the count was not computed for this caller (a non-operator read); the admin
// editor always receives a number, so a `null` is treated defensively as "unknown → blocked".
export function deleteControlView(
  retired: boolean,
  referenceCount: number | null,
): DeleteControlView {
  const base = {
    description: DESCRIPTION,
    actionLabel: "Delete permanently",
    busyLabel: "Deleting…",
    confirmMessage: CONFIRM_MESSAGE,
    successMessage: SUCCESS_MESSAGE,
  };

  if (!retired) {
    return {
      ...base,
      canDelete: false,
      blockingReason:
        "Retire this exercise before it can be deleted (retire first, then delete).",
    };
  }
  if (referenceCount === null) {
    return {
      ...base,
      canDelete: false,
      blockingReason: "Reference information is unavailable; reload to enable deletion.",
    };
  }
  if (referenceCount > 0) {
    return {
      ...base,
      canDelete: false,
      blockingReason:
        `This exercise has ${referencePhrase(referenceCount)} (prescriptions, logged ` +
        "sets, or relationships) and cannot be deleted while anything points at it.",
    };
  }
  return { ...base, canDelete: true, blockingReason: null };
}
