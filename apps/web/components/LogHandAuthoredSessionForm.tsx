"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { submitAuthorSession } from "@/app/sessions/log/actions";
import {
  DEFAULT_TRAINING_TYPE,
  addPerformedSet,
  isLogDraft,
  makeLoggedRow,
  removePerformedSet,
  toAuthoredFields,
  updatePerformedSet,
  type LogDraft,
  type LoggedExerciseRow,
} from "@/lib/hand-authored-draft";
import { buildAuthorSessionRequest } from "@/lib/hand-authored-session";
import { useFormDraft } from "@/lib/use-form-draft";
import type { WeightUnit } from "@/lib/weight-unit";
import { HandAuthoredExerciseList } from "@/components/hand-authored/hand-authored-exercise-list";
import {
  HandAuthoredNotices,
  TrainingTypeField,
} from "@/components/hand-authored/hand-authored-form-parts";
import { PerformedSetsEditor } from "@/components/hand-authored/performed-sets-editor";
import { useHandAuthoredExercises } from "@/components/hand-authored/use-hand-authored-exercises";
import { Field } from "@/components/pulse/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface LogHandAuthoredSessionFormProps {
  // Stable identity within the current account for the browser draft.
  draftId: string;
  // The latest date a performance can be logged on.
  today: string;
  // Whether the user carries a Sensitive Constraint (ADR-0023, issue #290): Supersets are
  // paused and the draft's grouping is unlinked. A non-medical Preference never sets this.
  hasSensitiveConstraint?: boolean;
  // The reader's Weight Unit (#417): each Load is entered in this unit and converted back to
  // canonical kilograms by the request builder.
  unit: WeightUnit;
}

// Log a past workout the user laid out themselves (ADR-0040, `/sessions/log`): it writes both
// sides of the plan-vs-record split in one submit — a reusable plan, and its first Logged
// Session with the date and the sets performed. Its sibling `PlanHandAuthoredSessionForm`
// writes the plan alone (audit C-1).
export function LogHandAuthoredSessionForm(props: LogHandAuthoredSessionFormProps) {
  const { userId, isLoaded } = useAuth();
  if (!isLoaded || !userId) return null;
  return <AccountScopedLogForm key={userId} {...props} />;
}

const NO_ROWS = (): LoggedExerciseRow[] => [];

// The form for one signed-in account. Every product route starts it blank through
// `LogHandAuthoredSessionForm`; `initialRows` exists for the audit harness, which mounts it with
// rows already added so a journey can measure the performed-set grid (`audit/main.tsx`).
export function AccountScopedLogForm({
  draftId,
  today,
  hasSensitiveConstraint = false,
  unit,
  initialRows = NO_ROWS,
}: LogHandAuthoredSessionFormProps & { initialRows?: () => LoggedExerciseRow[] }) {
  const router = useRouter();
  const editor = useHandAuthoredExercises<LoggedExerciseRow>({
    initialRows,
    initialTrainingType: DEFAULT_TRAINING_TYPE,
    makeRow: makeLoggedRow,
    hasSensitiveConstraint,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [performedOn, setPerformedOn] = useState(today);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const { restore, markInteracted, editRows } = editor;
  const restoreDraft = useCallback((restored: LogDraft) => {
    setPerformedOn(restored.performedOn);
    setIdempotencyKey(restored.idempotencyKey);
    restore(restored);
  }, [restore]);
  const { recovery, storageFailed, clearAfterSave } = useFormDraft({
    draftId,
    data: {
      idempotencyKey,
      performedOn,
      trainingType: editor.trainingType,
      exercises: editor.exercises,
    },
    isDirty: editor.isDirty,
    validate: isLogDraft,
    onRestore: restoreDraft,
  });

  // Submit the suppression-aware list, so a Sensitive-Constraint user never sends grouping even
  // if a stray group reached state; the endpoint stays the backstop.
  const submit = (formData: FormData) => {
    const result = buildAuthorSessionRequest(
      {
        performedOn: String(formData.get("performed_on") ?? ""),
        trainingType: editor.trainingType,
        exercises: editor.effectiveExercises.map(toAuthoredFields),
      },
      unit,
      today,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const outcome = await submitAuthorSession({
        ...result.request,
        idempotency_key: idempotencyKey,
      });
      if (outcome.error) setError(outcome.error);
      else if (outcome.redirectTo) {
        clearAfterSave();
        router.replace(outcome.redirectTo);
      }
    });
  };

  const records = new Map(
    editor.effectiveExercises.map((row) => [
      row.key,
      <PerformedSetsEditor
        key={row.key}
        row={row}
        unit={unit}
        onAddSet={() => {
          markInteracted();
          editRows((rows) => addPerformedSet(rows, row.key));
        }}
        onChangeSet={(setKey, patch) =>
          editRows((rows) => updatePerformedSet(rows, row.key, setKey, patch))
        }
        onRemoveSet={(setKey) => {
          markInteracted();
          editRows((rows) => removePerformedSet(rows, row.key, setKey));
        }}
      />,
    ]),
  );

  return (
    <form action={submit} onChange={markInteracted} className="flex flex-col gap-6">
      <HandAuthoredNotices
        recovery={recovery}
        storageFailed={storageFailed}
        error={error}
        hasSensitiveConstraint={hasSensitiveConstraint}
      />

      <Field label="Date performed">
        <Input
          name="performed_on"
          type="date"
          value={performedOn}
          onChange={(event) => setPerformedOn(event.target.value)}
          max={today}
          required
        />
      </Field>

      <TrainingTypeField value={editor.trainingType} onChange={editor.setTrainingType} />

      <HandAuthoredExerciseList editor={editor} unit={unit} records={records} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save workout"}
      </Button>
    </form>
  );
}
