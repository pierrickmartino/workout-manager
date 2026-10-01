"use client";

import { useMemo, useState, useTransition } from "react";

import { updateExerciseAction } from "@/app/admin/exercises/actions";
import {
  applyEditorEdit,
  buildExercisePatch,
  hasEditorChanges,
  overlayEditorEdits,
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
// without a browser); this holds only the form state and drives the save action. It diffs
// the server's current fields against the admin's edits so it can send *only the changed
// fields* and disable Save when nothing changed. The 409 name-collision error (and any
// other) is surfaced straight from the action's `error`. The backend is the real gate.
//
// The baseline is the `exercise` prop, not a mount-time snapshot of it: every sibling
// control on this page revalidates the route when it writes, so the Server Component can
// hand this form newer values while it is mounted (`overlayEditorEdits` explains why that
// has to win for an untouched field). `edits` therefore holds only the fields the admin
// touched, and a successful save clears it — the saved values arrive as fresh props.
export function AdminExerciseEditor({
  exercise,
}: {
  exercise: ExerciseDetail;
}): React.JSX.Element {
  const server = useMemo(() => toEditorFields(exercise), [exercise]);
  const [edits, setEdits] = useState<Partial<ExerciseEditorFields>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  const fields = overlayEditorEdits(server, edits);

  function set<K extends keyof ExerciseEditorFields>(
    key: K,
    value: ExerciseEditorFields[K],
  ): void {
    setSaved(false);
    setEdits((current) => applyEditorEdit(server, current, key, value));
  }

  const dirty = hasEditorChanges(server, fields);

  function save(): void {
    setError(null);
    setSaved(false);

    const message = validateEditorFields(fields);
    if (message) {
      setError(message);
      return;
    }

    const patch = buildExercisePatch(server, fields);
    if (Object.keys(patch).length === 0) return;

    startSaving(async () => {
      try {
        const result = await updateExerciseAction(exercise.id, patch);
        if (result.error || !result.exercise) {
          setError(result.error ?? "Could not save the exercise.");
          return;
        }
        // Drop the edits: the action revalidated this route, so the saved values come back
        // as fresh props and the diff resets with Save disabled until the next edit.
        setEdits({});
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

      {error ? <Alert announce tone="error">{error}</Alert> : null}
      {saved ? <Alert announce tone="success">Saved.</Alert> : null}

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
