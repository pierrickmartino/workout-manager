"use client";

import { useActionState } from "react";

import {
  submitCorrection,
  type CorrectLogFormState,
} from "@/app/history/[id]/edit/actions";
import type { CorrectionFormFields, CorrectionSetFields } from "@/lib/log-correction";
import { LOAD_KIND_OPTIONS } from "@/lib/load";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const RPE_VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

interface CorrectLogFormProps {
  logId: number;
  fields: CorrectionFormFields;
  today: string;
}

// The amount field(s) for a set row, shown by its kind (ADR-0032). This slice edits a
// set's contents within its existing kind, so the kind rides in a hidden field and the
// matching input is pre-filled. Clearing the amount drops the set on save.
function AmountFields({ set, index }: { set: CorrectionSetFields; index: number }) {
  const label = `${set.exerciseName} amount`;
  if (set.kind === "distance") {
    return (
      <div className="grid grid-cols-[1fr_5rem_1fr] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Distance</span>
          <Input
            name={`set-${index}-distance`}
            defaultValue={set.distance}
            aria-label={`Distance for ${set.exerciseName}`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Unit</span>
          <Select
            name={`set-${index}-unit`}
            defaultValue={set.unit}
            aria-label={`Distance unit for ${set.exerciseName}`}
          >
            <option value="km">km</option>
            <option value="mi">mi</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Time</span>
          <Input
            name={`set-${index}-duration`}
            defaultValue={set.duration}
            placeholder="25:00"
            aria-label={`Time for ${set.exerciseName}`}
          />
        </label>
      </div>
    );
  }

  if (set.kind === "duration") {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Time</span>
        <Input
          name={`set-${index}-duration`}
          defaultValue={set.duration}
          placeholder="5:00"
          aria-label={label}
        />
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono text-[9px] text-text-muted">Reps</span>
      <Input
        name={`set-${index}-reps`}
        type="number"
        min={0}
        defaultValue={set.reps}
        aria-label={`Reps for ${set.exerciseName}`}
      />
    </label>
  );
}

function SetRow({ set, index }: { set: CorrectionSetFields; index: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <input type="hidden" name={`set-${index}-exercise_id`} value={set.exerciseId} />
      <input type="hidden" name={`set-${index}-exercise_name`} value={set.exerciseName} />
      <input type="hidden" name={`set-${index}-kind`} value={set.kind} />
      <span className="font-display text-[15px] font-semibold text-text-primary">
        {set.exerciseName}
      </span>

      <div className="grid grid-cols-[1fr_5rem] gap-2.5">
        <AmountFields set={set} index={index} />
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">RPE</span>
          <Select
            name={`set-${index}-rpe`}
            defaultValue={set.perceivedDifficulty ?? ""}
            aria-label={`RPE for ${set.exerciseName}`}
          >
            <option value="">—</option>
            {RPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* Load is a typed value (ADR-0010): the picked kind is sent as-is so the record
          keeps the load's meaning at the boundary. */}
      <div className="grid grid-cols-[7rem_1fr] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Load kind</span>
          <Select
            name={`set-${index}-load_kind`}
            defaultValue={set.loadKind || "absolute"}
            aria-label={`Load kind for ${set.exerciseName}`}
          >
            {LOAD_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Load</span>
          <Input
            name={`set-${index}-load_value`}
            defaultValue={set.loadValue}
            placeholder="70"
            aria-label={`Load for ${set.exerciseName}`}
          />
        </label>
      </div>
    </div>
  );
}

// Edit an existing Logged Session's contents (ADR-0034). Every field is pre-filled from
// the record; the form full-replaces its sets on save. A plan-backed record's training
// type is derived from its Session, so it is shown read-only and not sent; a plan-less
// record's is an editable picker. The hidden `log_id`/`session_id` carry identity the
// backend treats as authoritative (the Session is never re-parented).
export function CorrectLogForm({ logId, fields, today }: CorrectLogFormProps) {
  const [state, action, pending] = useActionState<CorrectLogFormState, FormData>(
    submitCorrection,
    { error: null },
  );
  const isPlanLess = fields.sessionId === null;

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="log_id" value={logId} />
      <input
        type="hidden"
        name="session_id"
        value={fields.sessionId ?? ""}
      />
      <input type="hidden" name="set_count" value={fields.sets.length} />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Field label="Date performed">
        <Input
          name="performed_on"
          type="date"
          defaultValue={fields.performedOn}
          max={today}
          required
        />
      </Field>

      <Field label="Duration (seconds)" hint="Leave blank if it wasn't timed.">
        <Input
          name="duration_seconds"
          type="number"
          min={0}
          defaultValue={fields.durationSeconds ?? ""}
        />
      </Field>

      {isPlanLess ? (
        <Field label="Training type">
          <Select name="training_type" defaultValue={fields.trainingType}>
            {TRAINING_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="font-mono text-[11px] text-text-muted">
          {fields.trainingType} session — training type follows the protocol and can&apos;t
          be changed here.
        </p>
      )}

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <SectionHeader>SETS PERFORMED</SectionHeader>
        {fields.sets.map((set, index) => (
          <SetRow key={index} set={set} index={index} />
        ))}
      </fieldset>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
