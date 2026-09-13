"use client";

import { useState, useTransition } from "react";

import { updateExerciseAction } from "@/app/admin/exercises/actions";
import {
  buildExercisePatch,
  hasEditorChanges,
  toEditorFields,
  validateEditorFields,
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
  type ExerciseEditorFields,
} from "@/lib/admin-exercise-editor";
import type { ExerciseDetail } from "@/lib/sessions-types";
import { Alert } from "@/components/pulse/alert";
import { Field } from "@/components/pulse/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// The admin Exercise editor (issue #502): a thin Client Component. All parsing, validation,
// and the partial-patch diff live in the pure `lib/admin-exercise-editor` (unit-tested
// without a browser); this holds only the form state and drives the save action. It tracks
// the last-saved `initial` fields against the `current` edits so it can send *only the
// changed fields* and disable Save when nothing changed. The 409 name-collision error (and
// any other) is surfaced straight from the action's `error`. The backend is the real gate.
export function AdminExerciseEditor({
  exercise,
}: {
  exercise: ExerciseDetail;
}): React.JSX.Element {
  const [initial, setInitial] = useState<ExerciseEditorFields>(() =>
    toEditorFields(exercise),
  );
  const [fields, setFields] = useState<ExerciseEditorFields>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function set<K extends keyof ExerciseEditorFields>(
    key: K,
    value: ExerciseEditorFields[K],
  ): void {
    setSaved(false);
    setFields((current) => ({ ...current, [key]: value }));
  }

  const dirty = hasEditorChanges(initial, fields);

  function save(): void {
    setError(null);
    setSaved(false);

    const message = validateEditorFields(fields);
    if (message) {
      setError(message);
      return;
    }

    const patch = buildExercisePatch(initial, fields);
    if (Object.keys(patch).length === 0) return;

    startSaving(async () => {
      try {
        const result = await updateExerciseAction(exercise.id, patch);
        if (result.error || !result.exercise) {
          setError(result.error ?? "Could not save the exercise.");
          return;
        }
        // Re-baseline to the saved state so the diff resets and Save disables until the
        // next edit.
        const next = toEditorFields(result.exercise);
        setInitial(next);
        setFields(next);
        setSaved(true);
      } catch {
        setError("Could not save the exercise. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Name" htmlFor="exercise-name">
        <Input
          id="exercise-name"
          value={fields.name}
          onChange={(event) => set("name", event.target.value)}
        />
      </Field>

      <Field label="Description" htmlFor="exercise-description">
        <Textarea
          id="exercise-description"
          rows={3}
          value={fields.description}
          onChange={(event) => set("description", event.target.value)}
        />
      </Field>

      <Field
        label="Execution steps"
        htmlFor="exercise-instructions"
        hint="One step per line."
      >
        <Textarea
          id="exercise-instructions"
          rows={4}
          value={fields.instructions}
          onChange={(event) => set("instructions", event.target.value)}
        />
      </Field>

      <Field
        label="Targeted muscles"
        htmlFor="exercise-targeted"
        hint="One per line."
      >
        <Textarea
          id="exercise-targeted"
          rows={3}
          value={fields.targetedMuscles}
          onChange={(event) => set("targetedMuscles", event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="Primary muscles"
          htmlFor="exercise-primary"
          hint="Emphasis split — one per line."
        >
          <Textarea
            id="exercise-primary"
            rows={3}
            value={fields.primaryMuscles}
            onChange={(event) => set("primaryMuscles", event.target.value)}
          />
        </Field>
        <Field
          label="Secondary muscles"
          htmlFor="exercise-secondary"
          hint="Emphasis split — one per line."
        >
          <Textarea
            id="exercise-secondary"
            rows={3}
            value={fields.secondaryMuscles}
            onChange={(event) => set("secondaryMuscles", event.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Required equipment"
        htmlFor="exercise-equipment"
        hint="One per line."
      >
        <Textarea
          id="exercise-equipment"
          rows={2}
          value={fields.requiredEquipment}
          onChange={(event) => set("requiredEquipment", event.target.value)}
        />
      </Field>

      <Field
        label="Difficulty"
        htmlFor="exercise-difficulty"
        hint={`${MIN_DIFFICULTY}–${MAX_DIFFICULTY}, or blank for none.`}
      >
        <Input
          id="exercise-difficulty"
          type="number"
          min={MIN_DIFFICULTY}
          max={MAX_DIFFICULTY}
          value={fields.difficulty}
          onChange={(event) => set("difficulty", event.target.value)}
          className="w-28"
        />
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">Saved.</Alert> : null}

      <Button
        type="button"
        variant="primary"
        disabled={!dirty || isSaving}
        onClick={save}
      >
        {isSaving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
