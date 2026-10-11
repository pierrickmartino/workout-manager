"use client";

import { TRAINING_TYPES } from "@/lib/sessions-types";
import type { FormDraftRecovery as DraftRecovery } from "@/lib/use-form-draft";
import { FormDraftRecovery } from "@/components/FormDraftRecovery";
import { Alert } from "@/components/pulse/alert";
import { Field } from "@/components/pulse/field";
import { Select } from "@/components/ui/select";

// The pieces both Hand-Authored forms render around their exercise list (audit C-1).

interface HandAuthoredNoticesProps {
  recovery: DraftRecovery | null;
  storageFailed: boolean;
  error: string | null;
  hasSensitiveConstraint: boolean;
}

// The draft-recovery offer, the submit error, and, for a Sensitive-Constraint user, why
// Supersets are paused (ADR-0023) — the same posture the Builder takes.
export function HandAuthoredNotices({
  recovery,
  storageFailed,
  error,
  hasSensitiveConstraint,
}: HandAuthoredNoticesProps) {
  return (
    <>
      <FormDraftRecovery recovery={recovery} storageFailed={storageFailed} />
      {error ? <Alert announce tone="error">{error}</Alert> : null}

      {hasSensitiveConstraint ? (
        <Alert tone="info">
          Supersets are paused while a sensitive constraint (injury, rehabilitation,
          postpartum, or a flagged medical limitation) is active. Any existing
          Supersets have been unlinked; your workout saves as individual exercises.
        </Alert>
      ) : null}
    </>
  );
}

export function TrainingTypeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (trainingType: string) => void;
}) {
  return (
    <Field label="Training type">
      <Select
        name="training_type"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {TRAINING_TYPES.map((trainingType) => (
          <option key={trainingType} value={trainingType}>
            {trainingType}
          </option>
        ))}
      </Select>
    </Field>
  );
}
