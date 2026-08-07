"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { submitAuthorSession } from "@/app/sessions/log/actions";
import {
  buildAuthorSessionRequest,
  type AuthorSessionFields,
  type AuthoredExerciseFields,
} from "@/lib/hand-authored-session";
import { LOAD_KIND_OPTIONS } from "@/lib/load";
import type { PickedExercise } from "@/lib/protocol-builder";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { ExerciseLibrary } from "@/components/ExerciseLibrary";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface HandAuthoredSessionFormProps {
  today: string;
}

// One performed set the user is recording under an exercise, with a stable key so React
// can track rows across add/remove without re-keying the array.
interface PerformedSetRow {
  key: number;
  reps: string;
  loadKind: string;
  loadValue: string;
  perceivedDifficulty: string;
}

// One exercise in the draft: the picked catalog Exercise, its authored plan, and the
// sets performed. Held in component state and mapped to the payload by the pure
// `buildAuthorSessionRequest` view-model on submit.
interface ExerciseRow {
  key: number;
  exerciseId: number;
  exerciseName: string;
  sets: string;
  reps: string;
  restSeconds: string;
  tempo: string;
  loadKind: string;
  loadValue: string;
  performedSets: PerformedSetRow[];
}

const DEFAULT_LOAD_KIND = "absolute";
const DEFAULT_TRAINING_TYPE = "strength";

let nextKey = 0;
function makeKey(): number {
  nextKey += 1;
  return nextKey;
}

function makePerformedSet(): PerformedSetRow {
  return {
    key: makeKey(),
    reps: "",
    loadKind: DEFAULT_LOAD_KIND,
    loadValue: "",
    perceivedDifficulty: "",
  };
}

function makeExerciseRow(exercise: PickedExercise): ExerciseRow {
  return {
    key: makeKey(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    sets: "3",
    reps: "",
    restSeconds: "",
    tempo: "",
    loadKind: DEFAULT_LOAD_KIND,
    loadValue: "",
    performedSets: [makePerformedSet()],
  };
}

// The build-and-log screen for a Hand-Authored Session (ADR-0040): assemble a workout
// from catalog exercises (sets/reps/rest/tempo/typed Load) and record what was actually
// performed, then submit once to create the plan and its first Logged Session together.
// No supersets, no create-by-name in this slice — the catalog picker only.
export function HandAuthoredSessionForm({ today }: HandAuthoredSessionFormProps) {
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addExercise = (exercise: PickedExercise) =>
    setExercises((current) => [...current, makeExerciseRow(exercise)]);

  const removeExercise = (key: number) =>
    setExercises((current) => current.filter((row) => row.key !== key));

  const updateExercise = (key: number, patch: Partial<ExerciseRow>) =>
    setExercises((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const addPerformedSet = (key: number) =>
    setExercises((current) =>
      current.map((row) =>
        row.key === key
          ? { ...row, performedSets: [...row.performedSets, makePerformedSet()] }
          : row,
      ),
    );

  const updatePerformedSet = (
    exerciseKey: number,
    setKey: number,
    patch: Partial<PerformedSetRow>,
  ) =>
    setExercises((current) =>
      current.map((row) =>
        row.key === exerciseKey
          ? {
              ...row,
              performedSets: row.performedSets.map((set) =>
                set.key === setKey ? { ...set, ...patch } : set,
              ),
            }
          : row,
      ),
    );

  const removePerformedSet = (exerciseKey: number, setKey: number) =>
    setExercises((current) =>
      current.map((row) =>
        row.key === exerciseKey
          ? {
              ...row,
              performedSets:
                row.performedSets.length === 1
                  ? row.performedSets
                  : row.performedSets.filter((set) => set.key !== setKey),
            }
          : row,
      ),
    );

  const submit = (formData: FormData) => {
    const fields: AuthorSessionFields = {
      performedOn: String(formData.get("performed_on") ?? ""),
      trainingType: String(formData.get("training_type") ?? ""),
      exercises: exercises.map(
        (row): AuthoredExerciseFields => ({
          exerciseId: row.exerciseId,
          sets: row.sets,
          reps: row.reps,
          restSeconds: row.restSeconds,
          tempo: row.tempo,
          loadKind: row.loadKind,
          loadValue: row.loadValue,
          performedSets: row.performedSets.map((set) => ({
            reps: set.reps,
            loadKind: set.loadKind,
            loadValue: set.loadValue,
            perceivedDifficulty: set.perceivedDifficulty,
          })),
        }),
      ),
    };

    const result = buildAuthorSessionRequest(fields, today);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const outcome = await submitAuthorSession(result.request);
      // A successful submit redirects server-side; only a failure returns here.
      if (outcome?.error) setError(outcome.error);
    });
  };

  return (
    <form action={submit} className="flex flex-col gap-6">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label="Date performed">
        <Input
          name="performed_on"
          type="date"
          defaultValue={today}
          max={today}
          required
        />
      </Field>

      <Field label="Training type">
        <Select name="training_type" defaultValue={DEFAULT_TRAINING_TYPE}>
          {TRAINING_TYPES.map((trainingType) => (
            <option key={trainingType} value={trainingType}>
              {trainingType}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <SectionHeader>EXERCISES</SectionHeader>

        {exercises.length === 0 ? (
          <p className="font-mono text-[12px] text-text-muted">
            Search the catalog below to add the movements you trained.
          </p>
        ) : null}

        {exercises.map((row) => (
          <ExerciseCard
            key={row.key}
            row={row}
            onRemove={() => removeExercise(row.key)}
            onChange={(patch) => updateExercise(row.key, patch)}
            onAddSet={() => addPerformedSet(row.key)}
            onChangeSet={(setKey, patch) =>
              updatePerformedSet(row.key, setKey, patch)
            }
            onRemoveSet={(setKey) => removePerformedSet(row.key, setKey)}
          />
        ))}

        <ExerciseLibrary onPick={addExercise} />
      </fieldset>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save workout"}
      </Button>
    </form>
  );
}

interface ExerciseCardProps {
  row: ExerciseRow;
  onRemove: () => void;
  onChange: (patch: Partial<ExerciseRow>) => void;
  onAddSet: () => void;
  onChangeSet: (setKey: number, patch: Partial<PerformedSetRow>) => void;
  onRemoveSet: (setKey: number) => void;
}

function ExerciseCard({
  row,
  onRemove,
  onChange,
  onAddSet,
  onChangeSet,
  onRemoveSet,
}: ExerciseCardProps) {
  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-text-primary">
          {row.exerciseName}
        </h3>
        <Button
          type="button"
          variant="ghost"
          onClick={onRemove}
          aria-label={`Remove ${row.exerciseName}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* The authored plan: sets/reps/rest/tempo and a typed Load (ADR-0010). */}
      <div className="grid grid-cols-2 gap-2.5">
        <FieldLabel label="Sets">
          <Input
            type="number"
            min={1}
            value={row.sets}
            onChange={(event) => onChange({ sets: event.target.value })}
            aria-label={`Sets for ${row.exerciseName}`}
          />
        </FieldLabel>
        <FieldLabel label="Reps">
          <Input
            value={row.reps}
            placeholder="8-12"
            onChange={(event) => onChange({ reps: event.target.value })}
            aria-label={`Reps for ${row.exerciseName}`}
          />
        </FieldLabel>
        <FieldLabel label="Rest (sec)">
          <Input
            type="number"
            min={0}
            value={row.restSeconds}
            placeholder="90"
            onChange={(event) => onChange({ restSeconds: event.target.value })}
            aria-label={`Rest seconds for ${row.exerciseName}`}
          />
        </FieldLabel>
        <FieldLabel label="Tempo">
          <Input
            value={row.tempo}
            placeholder="3-1-1"
            onChange={(event) => onChange({ tempo: event.target.value })}
            aria-label={`Tempo for ${row.exerciseName}`}
          />
        </FieldLabel>
        <FieldLabel label="Load kind">
          <Select
            value={row.loadKind}
            onChange={(event) => onChange({ loadKind: event.target.value })}
            aria-label={`Load kind for ${row.exerciseName}`}
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
            value={row.loadValue}
            placeholder="60 kg"
            onChange={(event) => onChange({ loadValue: event.target.value })}
            aria-label={`Load for ${row.exerciseName}`}
          />
        </FieldLabel>
      </div>

      {/* The record: what was actually performed, set by set. */}
      <div className="flex flex-col gap-2.5">
        <SectionHeader>SETS PERFORMED</SectionHeader>
        {row.performedSets.map((set, index) => (
          <div
            key={set.key}
            className="grid grid-cols-[1fr_1.5fr_4rem_auto] items-end gap-2"
          >
            <FieldLabel label={`Set ${index + 1} reps`}>
              <Input
                type="number"
                min={0}
                value={set.reps}
                onChange={(event) =>
                  onChangeSet(set.key, { reps: event.target.value })
                }
                aria-label={`Set ${index + 1} reps for ${row.exerciseName}`}
              />
            </FieldLabel>
            <FieldLabel label="Load">
              <Input
                value={set.loadValue}
                placeholder="60 kg"
                onChange={(event) =>
                  onChangeSet(set.key, { loadValue: event.target.value })
                }
                aria-label={`Set ${index + 1} load for ${row.exerciseName}`}
              />
            </FieldLabel>
            <FieldLabel label="RPE">
              <Input
                type="number"
                min={1}
                max={10}
                value={set.perceivedDifficulty}
                onChange={(event) =>
                  onChangeSet(set.key, {
                    perceivedDifficulty: event.target.value,
                  })
                }
                aria-label={`Set ${index + 1} perceived difficulty for ${row.exerciseName}`}
              />
            </FieldLabel>
            {row.performedSets.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onRemoveSet(set.key)}
                aria-label={`Remove set ${index + 1} for ${row.exerciseName}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              <span aria-hidden />
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={onAddSet}
          className="w-full"
        >
          + Add a performed set
        </Button>
      </div>
    </Card>
  );
}

// A compact inline label wrapper for the grid fields; the pulse `Field` renders a fuller
// block, so this keeps the dense sets/reps grid tight.
function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono text-[9px] text-text-muted">{label}</span>
      {children}
    </label>
  );
}
