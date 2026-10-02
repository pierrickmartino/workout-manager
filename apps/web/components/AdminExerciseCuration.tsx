"use client";

import { useMemo, useState, useTransition } from "react";

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

// The tier the control shows is the server's, until the admin picks another one: a sibling
// control's write revalidates this route, so a mount-time snapshot would show a tier the
// movement no longer carries (see `overlayEditorEdits` for the same reasoning on the
// descriptive editor). `choice` is therefore null until they pick a *different* tier —
// re-picking the server's own is not a pending change, so it clears rather than pinning the
// control — and a successful save clears it too, the saved tier arriving as a fresh prop.
function ProvenanceControl({
  exercise,
}: {
  exercise: ExerciseDetail;
}): React.JSX.Element {
  const [choice, setChoice] = useState<ExerciseDetail["provenance"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  const value = choice ?? exercise.provenance;
  const dirty = value !== exercise.provenance;

  function save(): void {
    setError(null);
    setSaved(false);
    if (!dirty) return;

    startSaving(async () => {
      try {
        const result = await setProvenanceAction(exercise.id, value);
        if (result.error || !result.exercise) {
          setError(result.error ?? "Could not change the provenance.");
          return;
        }
        setChoice(null);
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
          value={value}
          onChange={(event) => {
            setSaved(false);
            const picked = event.target.value;
            setChoice(picked === exercise.provenance ? null : picked);
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

      {error ? <Alert announce tone="error">{error}</Alert> : null}
      {saved ? <Alert announce tone="success">Provenance updated.</Alert> : null}

      <Button
        type="button"
        variant="primary"
        disabled={!dirty || isSaving}
        onClick={save}
        className="self-start"
      >
        {isSaving ? "Saving…" : "Set provenance"}
      </Button>
    </div>
  );
}

// Same shape as the Provenance control above: the server's precautions until the admin
// types, so a sibling write's revalidation is not lost behind a mount-time snapshot, and a
// `draft` that outranks it so their typing is never discarded — cleared again when they
// type the server's own text back, which is an undone edit rather than a pending one.
function PrecautionsControl({
  exercise,
}: {
  exercise: ExerciseDetail;
}): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  const server = useMemo(
    () => precautionsToField(exercise.precautions),
    [exercise.precautions],
  );
  const field = draft ?? server;
  const dirty = hasPrecautionsChanges(server, field);

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
        // Drop the draft: the action revalidated this route, so the saved precautions come
        // back as a fresh prop.
        setDraft(null);
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
          rows={4}
          value={field}
          onChange={(event) => {
            setSaved(false);
            const typed = event.target.value;
            setDraft(typed === server ? null : typed);
          }}
        />
      </Field>

      {error ? <Alert announce tone="error">{error}</Alert> : null}
      {saved ? <Alert announce tone="success">Precautions saved.</Alert> : null}

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
