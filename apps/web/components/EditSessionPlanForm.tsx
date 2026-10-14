"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { submitEditPlan } from "@/app/sessions/[id]/actions";
import {
  buildEditPlanRequest,
  isEditDraft,
  makeEditRow,
  type EditSeed,
} from "@/lib/session-edit";
import { useFormDraft } from "@/lib/use-form-draft";
import type { WeightUnit } from "@/lib/weight-unit";
import { HandAuthoredExerciseList } from "@/components/hand-authored/hand-authored-exercise-list";
import {
  HandAuthoredNotices,
  TrainingTypeField,
} from "@/components/hand-authored/hand-authored-form-parts";
import { useHandAuthoredExercises } from "@/components/hand-authored/use-hand-authored-exercises";
import { Button } from "@/components/ui/button";

interface EditSessionPlanFormProps {
  sessionId: number;
  // The Session folded into the editor's opening rows (`editSeedFromSession`).
  seed: EditSeed;
  // Whether the user carries a Sensitive Constraint (ADR-0023): Supersets are paused and the
  // draft's grouping is unlinked.
  hasSensitiveConstraint: boolean;
  unit: WeightUnit;
}

// Edit a standalone Session in place (ADR-0133): the Hand-Authored editor opened on the
// Session's own plan — reorder, re-dose, re-time, add or drop movements — saved back over it.
// The Session keeps its id, name, Provenance and Favorite; its logged history is untouched.
export function EditSessionPlanForm(props: EditSessionPlanFormProps) {
  const { userId, isLoaded } = useAuth();
  if (!isLoaded || !userId) return null;
  return <AccountScopedEditForm key={userId} {...props} />;
}

function AccountScopedEditForm({
  sessionId,
  seed,
  hasSensitiveConstraint,
  unit,
}: EditSessionPlanFormProps) {
  const router = useRouter();
  const editor = useHandAuthoredExercises({
    initialRows: () => seed.rows,
    initialTrainingType: seed.trainingType,
    makeRow: makeEditRow,
    hasSensitiveConstraint,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { recovery, storageFailed, clearAfterSave } = useFormDraft({
    draftId: `session-edit:${sessionId}`,
    data: { trainingType: editor.trainingType, exercises: editor.exercises },
    isDirty: editor.isDirty,
    validate: isEditDraft,
    onRestore: editor.restore,
  });

  // Submit the suppression-aware list, so a Sensitive-Constraint user never sends grouping;
  // the endpoint stays the backstop.
  const submit = () => {
    const result = buildEditPlanRequest(
      { trainingType: editor.trainingType, rows: editor.effectiveExercises },
      unit,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const outcome = await submitEditPlan(sessionId, result.request);
      if (outcome.error) setError(outcome.error);
      else if (outcome.redirectTo) {
        clearAfterSave();
        router.replace(outcome.redirectTo);
      }
    });
  };

  return (
    <form action={submit} onChange={editor.markInteracted} className="flex flex-col gap-6">
      <HandAuthoredNotices
        recovery={recovery}
        storageFailed={storageFailed}
        error={error}
        hasSensitiveConstraint={hasSensitiveConstraint}
      />

      <TrainingTypeField value={editor.trainingType} onChange={editor.setTrainingType} />

      <HandAuthoredExerciseList editor={editor} unit={unit} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
