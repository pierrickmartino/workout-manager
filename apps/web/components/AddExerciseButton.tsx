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
import { LOAD_KIND_OPTIONS } from "@/lib/load";
import {
  AMOUNT_KIND_OPTIONS,
  DISTANCE_UNIT_OPTIONS,
  type DistanceUnit,
  type QuantityKind,
} from "@/lib/quantity";
import type { PickedExercise } from "@/lib/protocol-builder";
import { ExerciseLibrary } from "@/components/ExerciseLibrary";
import { FieldLabel } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface AddExerciseButtonProps {
  sessionId: number;
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
export function AddExerciseButton({ sessionId }: AddExerciseButtonProps) {
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

    const result = buildInsertPrescriptionRequest(fields);
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

  const isDuration = editor.kind === "duration";
  const isDistance = editor.kind === "distance";
  const targetLabel = isDuration ? "Hold (time)" : isDistance ? "Distance" : "Reps";
  const targetPlaceholder = isDuration ? "45s" : isDistance ? "5 km" : "8-12";
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

          {/* The authored plan: an Amount kind, then sets/target/rest/tempo and a typed Load
              (ADR-0010, ADR-0032) — the same plan fields the Hand-Authored editor collects. */}
          <div className="grid grid-cols-2 gap-2.5">
            <FieldLabel label="Quantity">
              <Select
                value={editor.kind}
                onChange={(event) => {
                  // Picking a kind re-defaults the plan's Load kind for it (bodyweight for a
                  // hold or a run, absolute for reps) — still overridable below.
                  const kind = event.target.value as QuantityKind;
                  patch({ kind, loadKind: defaultLoadKindForAmount(kind) });
                }}
                aria-label={`Quantity kind for ${exerciseName}`}
              >
                {AMOUNT_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            {isDistance ? (
              <FieldLabel label="Unit">
                <Select
                  value={editor.unit}
                  onChange={(event) =>
                    patch({ unit: event.target.value as DistanceUnit })
                  }
                  aria-label={`Distance unit for ${exerciseName}`}
                >
                  {DISTANCE_UNIT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FieldLabel>
            ) : null}
            <FieldLabel label="Sets">
              <Input
                type="number"
                min={1}
                value={editor.sets}
                onChange={(event) => patch({ sets: event.target.value })}
                aria-label={`Sets for ${exerciseName}`}
              />
            </FieldLabel>
            <FieldLabel label={targetLabel}>
              <Input
                value={editor.reps}
                placeholder={targetPlaceholder}
                onChange={(event) => patch({ reps: event.target.value })}
                aria-label={`${targetLabel} for ${exerciseName}`}
              />
            </FieldLabel>
            <FieldLabel label="Rest (sec)">
              <Input
                type="number"
                min={0}
                value={editor.restSeconds}
                placeholder="90"
                onChange={(event) => patch({ restSeconds: event.target.value })}
                aria-label={`Rest seconds for ${exerciseName}`}
              />
            </FieldLabel>
            <FieldLabel label="Tempo">
              <Input
                value={editor.tempo}
                placeholder="3-1-1"
                onChange={(event) => patch({ tempo: event.target.value })}
                aria-label={`Tempo for ${exerciseName}`}
              />
            </FieldLabel>
            <FieldLabel label="Load kind">
              <Select
                value={editor.loadKind}
                onChange={(event) => patch({ loadKind: event.target.value })}
                aria-label={`Load kind for ${exerciseName}`}
              >
                {LOAD_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel label="Load">
              <Input
                value={editor.loadValue}
                placeholder="60 kg"
                onChange={(event) => patch({ loadValue: event.target.value })}
                aria-label={`Load for ${exerciseName}`}
              />
            </FieldLabel>
          </div>
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
