import type { ExercisePrescription } from "./sessions-types";

// View-model for the "Restore original" control on a prescription (ADR-0143, #788). Once a
// prescription has been substituted, the read names its Prescribed Original — only the
// Exercise name; the original Load never leaves the server — and Restore puts the Exercise,
// Load and Progression Scheme back exactly. It is offered only where Substitution is, so
// never on a performed Protocol Session (the server 409 backstops it).
export interface RestoreOriginalView {
  show: boolean;
  label: string;
  description: string;
}

const LABEL = "Restore original";
const UNNAMED_DESCRIPTION = "Back to the prescribed exercise";

export function restoreOriginalView(
  prescription: Pick<ExercisePrescription, "prescribed_original">,
  { canSubstitute }: { canSubstitute: boolean },
): RestoreOriginalView {
  const original = prescription.prescribed_original ?? null;
  const name = original?.exercise_name.trim() ?? "";
  return {
    show: canSubstitute && original !== null,
    label: LABEL,
    description: name ? `Back to ${name}` : UNNAMED_DESCRIPTION,
  };
}
