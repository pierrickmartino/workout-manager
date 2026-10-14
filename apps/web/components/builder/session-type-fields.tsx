"use client";

import { FIELD_WIDTH, FieldRow, WIDE_FIELD_WIDTH } from "@/components/pulse/field-row";
import { Field } from "@/components/pulse/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TRAINING_TYPES } from "@/lib/sessions-types";

// Mirrors the server's deploy bounds (`MIN/MAX_DURATION_MINUTES`), which validate again.
const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 360;

interface SessionTypeFieldsProps {
  trainingType: string;
  durationMinutes: number;
  // A performed Session is settled record (ADR-0020): it shows both values, read-only.
  locked: boolean;
  onSetTrainingType: (trainingType: string) => void;
  onSetDuration: (durationMinutes: number) => void;
}

// A Session's own Training Type and duration on its Builder card (#707). A Session may be
// typed apart from its Protocol — a run day in a strength plan — so both are set here, in
// plain sight: a run day that cannot be seen to be `cardio` is the bug this fixes.
export function SessionTypeFields({
  trainingType,
  durationMinutes,
  locked,
  onSetTrainingType,
  onSetDuration,
}: SessionTypeFieldsProps) {
  return (
    <FieldRow className="gap-3">
      <Field className={WIDE_FIELD_WIDTH} label="Training type">
        <Select
          value={trainingType}
          disabled={locked}
          onChange={(event) => onSetTrainingType(event.target.value)}
        >
          {TRAINING_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </Field>
      <Field className={FIELD_WIDTH} label="Minutes">
        {/* An unparseable or empty entry is ignored so the draft never holds a NaN; an
            out-of-range one is clamped, as the reshape fields do. */}
        <Input
          type="number"
          min={MIN_DURATION_MINUTES}
          max={MAX_DURATION_MINUTES}
          value={durationMinutes}
          disabled={locked}
          spellCheck={false}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            if (Number.isNaN(next)) return;
            onSetDuration(
              Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, next)),
            );
          }}
        />
      </Field>
    </FieldRow>
  );
}
