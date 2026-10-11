"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { submitAuthorPlan } from "@/app/sessions/log/actions";
import type { CaptureSeed } from "@/lib/capture-seed";
import {
  DEFAULT_TRAINING_TYPE,
  isPlanDraft,
  makePlanRow,
  seededPlanRow,
  toAuthoredFields,
  type PlanExerciseRow,
} from "@/lib/hand-authored-draft";
import { buildAuthorPlanRequest } from "@/lib/hand-authored-session";
import { useFormDraft } from "@/lib/use-form-draft";
import type { WeightUnit } from "@/lib/weight-unit";
import { HandAuthoredExerciseList } from "@/components/hand-authored/hand-authored-exercise-list";
import {
  HandAuthoredNotices,
  TrainingTypeField,
} from "@/components/hand-authored/hand-authored-form-parts";
import { useHandAuthoredExercises } from "@/components/hand-authored/use-hand-authored-exercises";
import { Button } from "@/components/ui/button";

interface PlanHandAuthoredSessionFormProps {
  // Stable identity within the current account for the browser draft. Capture includes its
  // source record id, so two capture journeys never offer one another's fields.
  draftId: string;
  // Whether the user carries a Sensitive Constraint (ADR-0023): Supersets are paused and the
  // draft's grouping is unlinked.
  hasSensitiveConstraint?: boolean;
  // The Capture pre-fill (ADR-0044): a plan-less record's contents folded into exercise rows,
  // and its training type as the default. Absent on `/sessions/build`, which starts blank.
  seed?: CaptureSeed;
  // The reader's Weight Unit (#417).
  unit: WeightUnit;
}

// Author a reusable plan and log nothing (audit C-1): `/sessions/build` (ADR-0071) from a blank
// draft, and Capture (`/history/[id]/capture`, ADR-0044) from a record's seed. It writes only the
// plan side of the plan-vs-record split, so it has no date and no performed sets. Its sibling
// `LogHandAuthoredSessionForm` also logs a first performance.
export function PlanHandAuthoredSessionForm(props: PlanHandAuthoredSessionFormProps) {
  const { userId, isLoaded } = useAuth();
  if (!isLoaded || !userId) return null;
  return <AccountScopedPlanForm key={userId} {...props} />;
}

function AccountScopedPlanForm({
  draftId,
  hasSensitiveConstraint = false,
  seed,
  unit,
}: PlanHandAuthoredSessionFormProps) {
  const router = useRouter();
  const editor = useHandAuthoredExercises<PlanExerciseRow>({
    initialRows: () => (seed ? seed.exercises.map(seededPlanRow) : []),
    initialTrainingType: seed?.trainingType ?? DEFAULT_TRAINING_TYPE,
    makeRow: makePlanRow,
    hasSensitiveConstraint,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { recovery, storageFailed, clearAfterSave } = useFormDraft({
    draftId,
    data: { trainingType: editor.trainingType, exercises: editor.exercises },
    isDirty: editor.isDirty,
    validate: isPlanDraft,
    onRestore: editor.restore,
  });

  // Submit the suppression-aware list, so a Sensitive-Constraint user never sends grouping even
  // if a stray group reached state; the endpoint stays the backstop.
  const submit = () => {
    const result = buildAuthorPlanRequest(
      {
        trainingType: editor.trainingType,
        exercises: editor.effectiveExercises.map(toAuthoredFields),
      },
      unit,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const outcome = await submitAuthorPlan(result.request);
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
        {pending ? "Saving…" : "Save reusable session"}
      </Button>
    </form>
  );
}
