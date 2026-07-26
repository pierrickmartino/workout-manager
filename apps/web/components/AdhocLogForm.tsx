"use client";

import { useActionState, useState } from "react";

import { submitAdhocLog, type AdhocLogFormState } from "@/app/logs/new/actions";
import { LOAD_KIND_OPTIONS } from "@/lib/load";
import type { QuantityKind } from "@/lib/quantity";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface AdhocLogFormProps {
  today: string;
}

interface SetRow {
  id: number;
  kind: QuantityKind;
}

let nextRowId = 0;
function makeRow(kind: QuantityKind): SetRow {
  nextRowId += 1;
  return { id: nextRowId, kind };
}

// Logs one or more ad-hoc movements outside any Protocol (ADR-0031): pick a training
// type, then add a row per set performed. Each row's amount is a typed Quantity
// (ADR-0032): a rep count, a distance (km/miles, with an optional time), or a duration (a
// hold or a distance-unknown timed effort). Heterogeneous rows coexist in one Logged
// Session — a 6 × 800 m interval session is six distance rows, a run then squats is a
// distance row and a rep row. No Session, no Completion Outcome — a plan-less record.
export function AdhocLogForm({ today }: AdhocLogFormProps) {
  const [state, action, pending] = useActionState<AdhocLogFormState, FormData>(
    submitAdhocLog,
    { error: null },
  );
  const [rows, setRows] = useState<SetRow[]>(() => [makeRow("distance")]);

  const setRowKind = (id: number, kind: QuantityKind) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, kind } : row)),
    );
  const addRow = () => setRows((current) => [...current, makeRow("distance")]);
  const removeRow = (id: number) =>
    setRows((current) =>
      current.length === 1 ? current : current.filter((row) => row.id !== id),
    );

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

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
        <Select name="training_type" defaultValue="cardio">
          {TRAINING_TYPES.map((trainingType) => (
            <option key={trainingType} value={trainingType}>
              {trainingType}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <SectionHeader>SETS PERFORMED</SectionHeader>

        {/* The parser reads rows by contiguous index 0…set_count-1 (readAdhocFormRows),
            so field indices follow the array position, not the React key. */}
        <input type="hidden" name="set_count" value={rows.length} />

        {rows.map((row, index) => (
          <SetRowFields
            key={row.id}
            index={index}
            kind={row.kind}
            onKindChange={(kind) => setRowKind(row.id, kind)}
            onRemove={rows.length > 1 ? () => removeRow(row.id) : undefined}
          />
        ))}

        <Button type="button" variant="secondary" onClick={addRow} className="w-full">
          + Add another set
        </Button>
      </fieldset>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Log it"}
      </Button>
    </form>
  );
}

interface SetRowFieldsProps {
  index: number;
  kind: QuantityKind;
  onKindChange: (kind: QuantityKind) => void;
  onRemove?: () => void;
}

function SetRowFields({ index, kind, onKindChange, onRemove }: SetRowFieldsProps) {
  const prefix = `set-${index}`;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-end gap-2.5">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Movement</span>
          <Input
            name={`${prefix}-movement`}
            placeholder="Running"
            aria-label={`Movement name, set ${index + 1}`}
            required
          />
        </label>
        {onRemove ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onRemove}
            aria-label={`Remove set ${index + 1}`}
          >
            Remove
          </Button>
        ) : null}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Amount</span>
        <Select
          name={`${prefix}-kind`}
          value={kind}
          onChange={(event) => onKindChange(event.target.value as QuantityKind)}
          aria-label={`Amount kind, set ${index + 1}`}
        >
          <option value="repetitions">Reps</option>
          <option value="distance">Distance</option>
          <option value="duration">Duration</option>
        </Select>
      </label>

      {kind === "distance" ? (
        <DistanceFields prefix={prefix} index={index} />
      ) : kind === "duration" ? (
        <DurationFields prefix={prefix} index={index} />
      ) : (
        <RepetitionsFields prefix={prefix} index={index} />
      )}

      {/* Load is a typed value (ADR-0010): pick its kind, then give the value that kind
          carries. Left blank, the set records no load. */}
      <div className="grid grid-cols-[7rem_1fr] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Load kind</span>
          <Select
            name={`${prefix}-load_kind`}
            defaultValue="bodyweight"
            aria-label={`Load kind, set ${index + 1}`}
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
            name={`${prefix}-load_value`}
            placeholder="0"
            aria-label={`Load, set ${index + 1}`}
          />
        </label>
      </div>
    </div>
  );
}

function RepetitionsFields({ prefix, index }: { prefix: string; index: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Reps</span>
        <Input
          name={`${prefix}-reps`}
          type="number"
          min={0}
          aria-label={`Reps, set ${index + 1}`}
        />
      </label>
    </div>
  );
}

function DistanceFields({ prefix, index }: { prefix: string; index: number }) {
  return (
    <div className="grid grid-cols-[1fr_5rem_1fr] gap-2.5">
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Distance</span>
        <Input
          name={`${prefix}-distance`}
          type="number"
          min={0}
          step="any"
          placeholder="5"
          aria-label={`Distance, set ${index + 1}`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Unit</span>
        <Select
          name={`${prefix}-unit`}
          defaultValue="km"
          aria-label={`Distance unit, set ${index + 1}`}
        >
          <option value="km">km</option>
          <option value="mi">mi</option>
        </Select>
      </label>
      <label className="flex flex-col gap-1.5">
        {/* Time is optional (ADR-0032): given, pace becomes a derivable read. */}
        <span className="label-mono text-[9px] text-text-muted">Time (opt.)</span>
        <Input
          name={`${prefix}-duration`}
          placeholder="mm:ss"
          aria-label={`Time, set ${index + 1}`}
        />
      </label>
    </div>
  );
}

function DurationFields({ prefix, index }: { prefix: string; index: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <label className="flex flex-col gap-1.5">
        {/* A duration is timed, non-locomotion work (a hold, a distance-unknown treadmill
            session): the time is the amount, entered as mm:ss or bare seconds (ADR-0032). */}
        <span className="label-mono text-[9px] text-text-muted">Time</span>
        <Input
          name={`${prefix}-duration`}
          placeholder="mm:ss"
          aria-label={`Duration, set ${index + 1}`}
        />
      </label>
    </div>
  );
}
