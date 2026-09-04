"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { resolveAuthoredExercise } from "@/app/sessions/log/actions";
import { submitInsertPrescription } from "@/app/sessions/[id]/actions";
import {
  buildInsertPrescriptionRequest,
  type InsertPrescriptionFields,
} from "@/lib/insert-prescription";
import { defaultLoadKindForAmount } from "@/lib/hand-authored-session";
import type { WeightUnit } from "@/lib/weight-unit";
import { type DistanceUnit, type QuantityKind } from "@/lib/quantity";
import type { PickedExercise } from "@/lib/protocol-builder";
import { ExerciseLibrary } from "@/components/ExerciseLibrary";
import { PrescriptionFieldStack } from "@/components/prescription/PrescriptionFieldStack";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AddExerciseButtonProps {
  sessionId: number;
  // The reader's Weight Unit (#417): the Load picker/placeholder name it and the appended
  // prescription's Load is converted back to canonical kilograms on save.
  unit: WeightUnit;
}

// The plan-side editor state for the one prescription being appended — the same fields the
// Hand-Authored form's plan side collects, minus the Superset overlay and performed sets
// (Insert appends one solo movement, ADR-0051). `exercise` is `null` until a catalog Exercise
// is picked (or minted); the plan fields below are edited once it is.
interface EditorState {
  exercise: PickedExercise | null;
  kind: QuantityKind;
  unit: DistanceUnit;
  sets: string;
  reps: string;
  restSeconds: string;
  tempo: string;
  loadKind: string;
  loadValue: string;
}

const DEFAULT_AMOUNT_KIND: QuantityKind = "repetitions";
const DEFAULT_DISTANCE_UNIT: DistanceUnit = "km";

function freshEditor(): EditorState {
  return {
    exercise: null,
    kind: DEFAULT_AMOUNT_KIND,
    unit: DEFAULT_DISTANCE_UNIT,
    sets: "3",
    reps: "",
    restSeconds: "",
    tempo: "",
    loadKind: defaultLoadKindForAmount(DEFAULT_AMOUNT_KIND),
    loadValue: "",
  };
}

// The "Add exercise" affordance at the bottom of a standalone Session's prescription list
// (Insert, ADR-0051, issue #360): hand-author one new movement into the reusable workout —
// pick a Catalog Exercise, then sets, a typed Quantity, rest, tempo, and a typed Load — and
// append it in place with no AI call. Opens the same prescription editor the Hand-Authored
// Session form uses; the pure `buildInsertPrescriptionRequest` view-model maps the fields to
// the Insert request and names the first invalid field before anything is sent. On success the
// Session page revalidates and the new prescription renders last (and shows up in the next
// Repeat/Start/Log). Rendered only on a standalone Session — never a Protocol member, where
// adding stays the Builder's tail-gated Deploy path (standalone-only, per ADR-0051).
export function AddExerciseButton({ sessionId, unit }: AddExerciseButtonProps) {
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(freshEditor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const patch = (next: Partial<EditorState>) =>
    setEditor((current) => ({ ...current, ...next }));

  const reset = () => {
    setEditor(freshEditor());
    setError(null);
  };

  const close = () => {
    reset();
    setOpen(false);
  };

  // Resolve a typed movement to a catalog Exercise (minting a `user_entered` one on a miss)
  // and select it, reusing the same search-and-create action the Hand-Authored picker uses
  // (ADR-0033). A user-safe error is returned for the picker to surface.
  const createExercise = async (name: string): Promise<{ error: string | null }> => {
    const outcome = await resolveAuthoredExercise(name);
    if (outcome.exercise) {
      patch({ exercise: outcome.exercise });
      setError(null);
    }
    return { error: outcome.error };
  };

  const submit = () => {
    const fields: InsertPrescriptionFields = {
      exerciseId: editor.exercise?.id ?? null,
      kind: editor.kind,
      unit: editor.unit,
      sets: editor.sets,
      reps: editor.reps,
      restSeconds: editor.restSeconds,
      tempo: editor.tempo,
      loadKind: editor.loadKind,
      loadValue: editor.loadValue,
    };

    const result = buildInsertPrescriptionRequest(fields, unit);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const outcome = await submitInsertPrescription(sessionId, result.request);
      // The server re-validates and can still reject (a Protocol member, an unknown exercise,
      // a deploy-rule failure): surface its message and keep the editor open so nothing is lost.
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      close();
    });
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Add exercise
      </Button>
    );
  }

  const exerciseName = editor.exercise?.name;

  return (
    <Card className="flex flex-col gap-4 p-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {editor.exercise === null ? (
        <ExerciseLibrary
          onPick={(exercise) => {
            patch({ exercise });
            setError(null);
          }}
          onCreate={createExercise}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold text-text-primary">
              {exerciseName}
            </h3>
            <Button
              type="button"
              variant="ghost"
              onClick={() => patch({ exercise: null })}
              aria-label="Pick a different exercise"
            >
              Change
            </Button>
          </div>

          {/* The authored plan — the one shared, presentation-only field stack every
              authoring surface now renders (ADR-0067, #464): Quantity, sets, target, rest,
              tempo, and a typed Load. Insert appends one solo movement, so it carries no
              surface-specific advanced fields. */}
          <PrescriptionFieldStack
            exerciseName={exerciseName ?? ""}
            weightUnit={unit}
            kind={editor.kind}
            unit={editor.unit}
            sets={editor.sets}
            target={editor.reps}
            restSeconds={editor.restSeconds}
            tempo={editor.tempo}
            loadKind={editor.loadKind}
            loadValue={editor.loadValue}
            showRest
            onChangeKind={(kind) =>
              // Picking a kind re-defaults the plan's Load kind for it (bodyweight for a hold
              // or a run, absolute for reps) — still overridable below.
              patch({ kind, loadKind: defaultLoadKindForAmount(kind) })
            }
            onChangeUnit={(unit) => patch({ unit })}
            onChangeSets={(value) => patch({ sets: value })}
            onChangeTarget={(value) => patch({ reps: value })}
            onChangeRest={(value) => patch({ restSeconds: value })}
            onChangeTempo={(value) => patch({ tempo: value })}
            onChangeLoadKind={(value) => patch({ loadKind: value })}
            onChangeLoadValue={(value) => patch({ loadValue: value })}
          />
        </>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={pending || editor.exercise === null}
          className="w-full"
        >
          {pending ? "Adding…" : "Add to session"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={close}
          disabled={pending}
          className="w-full"
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}
