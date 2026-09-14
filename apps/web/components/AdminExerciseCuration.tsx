"use client";

import { useState, useTransition } from "react";

import {
  setPrecautionsAction,
  setProvenanceAction,
} from "@/app/admin/exercises/actions";
import {
  hasPrecautionsChanges,
  parsePrecautionsInput,
  precautionsToField,
  provenanceOptions,
} from "@/lib/admin-exercise-curation";
import type { ExerciseDetail } from "@/lib/sessions-types";
import { Alert } from "@/components/pulse/alert";
import { Field } from "@/components/pulse/field";
import { SectionHeader } from "@/components/pulse/section-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// The curator controls on the admin Exercise editor (issue #503, ADR-0075/0076 spec §5): a
// distinct Provenance control and the curator-only precautions field, each with its **own**
// Save so neither is a side effect of the descriptive-field save (issue #502). A thin Client
// Component — the vocabulary, parsing, and change detection live in the pure
// `lib/admin-exercise-curation` (unit-tested without a browser). The backend is the real gate
// (`require_admin`) and it audits the Provenance change and HTML-escapes precautions at its
// write boundary; this only forwards values and re-baselines to the saved state.
export function AdminExerciseCuration({
  exercise,
}: {
  exercise: ExerciseDetail;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <ProvenanceControl exercise={exercise} />
      <PrecautionsControl exercise={exercise} />
    </div>
  );
}

function ProvenanceControl({
  exercise,
}: {
  exercise: ExerciseDetail;
}): React.JSX.Element {
  const [initial, setInitial] = useState(exercise.provenance);
  const [value, setValue] = useState(exercise.provenance);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function save(): void {
    setError(null);
    setSaved(false);
    if (value === initial) return;

    startSaving(async () => {
      try {
        const result = await setProvenanceAction(exercise.id, value);
        if (result.error || !result.exercise) {
          setError(result.error ?? "Could not change the provenance.");
          return;
        }
        setInitial(result.exercise.provenance);
        setValue(result.exercise.provenance);
        setSaved(true);
      } catch {
        setError("Could not change the provenance. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>Provenance</SectionHeader>
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Set the trust tier deliberately. Promote to Curated once you have reviewed this
        movement, or correct/demote it. Every change is recorded in the audit trail below.
      </p>
      <Field label="Provenance" htmlFor="exercise-provenance">
        <Select
          id="exercise-provenance"
          value={value}
          onChange={(event) => {
            setSaved(false);
            setValue(event.target.value);
          }}
          className="sm:w-64"
        >
          {provenanceOptions().map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">Provenance updated.</Alert> : null}

      <Button
        type="button"
        variant="primary"
        disabled={value === initial || isSaving}
        onClick={save}
        className="self-start"
      >
        {isSaving ? "Saving…" : "Set provenance"}
      </Button>
    </div>
  );
}

function PrecautionsControl({
  exercise,
}: {
  exercise: ExerciseDetail;
}): React.JSX.Element {
  const [initial, setInitial] = useState(() =>
    precautionsToField(exercise.precautions),
  );
  const [field, setField] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  const dirty = hasPrecautionsChanges(initial, field);

  function save(): void {
    setError(null);
    setSaved(false);
    if (!dirty) return;

    startSaving(async () => {
      try {
        const result = await setPrecautionsAction(
          exercise.id,
          parsePrecautionsInput(field),
        );
        if (result.error || !result.exercise) {
          setError(result.error ?? "Could not save the precautions.");
          return;
        }
        const next = precautionsToField(result.exercise.precautions);
        setInitial(next);
        setField(next);
        setSaved(true);
      } catch {
        setError("Could not save the precautions. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>Precautions</SectionHeader>
      <Field
        label="Precautions"
        htmlFor="exercise-precautions"
        hint="One precaution per line. Shown on the Exercise page — important for injury/rehab cases."
      >
        <Textarea
          id="exercise-precautions"
          rows={4}
          value={field}
          onChange={(event) => {
            setSaved(false);
            setField(event.target.value);
          }}
        />
      </Field>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">Precautions saved.</Alert> : null}

      <Button
        type="button"
        variant="primary"
        disabled={!dirty || isSaving}
        onClick={save}
        className="self-start"
      >
        {isSaving ? "Saving…" : "Save precautions"}
      </Button>
    </div>
  );
}
