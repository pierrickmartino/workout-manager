"use client";

import { useActionState, useRef, useState } from "react";

import {
  submitCorrection,
  type CorrectLogFormState,
} from "@/app/history/[id]/edit/actions";
import type { CorrectionFormFields, CorrectionSetFields } from "@/lib/log-correction";
import { loadKindOptions } from "@/lib/load";
import type { WeightUnit } from "@/lib/weight-unit";
import type { QuantityKind } from "@/lib/quantity";
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
  // The reader's Weight Unit (#417): each Load pre-fills and is entered in this unit, the
  // picker names it, and the edit action converts the entry back to canonical kilograms.
  unit: WeightUnit;
}

// One client-added row (issue #358): a movement the user also performed but never
// logged, including one the plan never prescribed. Its Exercise id is resolved from the
// typed movement name server-side (ADR-0033), so unlike a pre-filled row it carries a
// name field and an editable amount kind rather than hidden id/kind fields.
interface AddedRow {
  id: number;
  kind: QuantityKind;
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

function SetRow({
  set,
  index,
  unit,
}: {
  set: CorrectionSetFields;
  index: number;
  unit: WeightUnit;
}) {
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
            {loadKindOptions(unit).map((option) => (
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
export function CorrectLogForm({ logId, fields, today, unit }: CorrectLogFormProps) {
  const [state, action, pending] = useActionState<CorrectLogFormState, FormData>(
    submitCorrection,
    { error: null },
  );
  const [addedRows, setAddedRows] = useState<AddedRow[]>([]);
  // A monotonic source of React keys for added rows, scoped to this form instance so ids
  // never leak between mounts. Bumped only when a row is added.
  const nextRowId = useRef(0);
  const isPlanLess = fields.sessionId === null;

  const addRow = () => {
    nextRowId.current += 1;
    const id = nextRowId.current;
    setAddedRows((current) => [...current, { id, kind: "repetitions" }]);
  };
  const removeRow = (id: number) =>
    setAddedRows((current) => current.filter((row) => row.id !== id));
  const setRowKind = (id: number, kind: QuantityKind) =>
    setAddedRows((current) =>
      current.map((row) => (row.id === id ? { ...row, kind } : row)),
    );

  // The parser reads rows by contiguous index 0…set_count-1: the pre-filled rows keep
  // their positions, and each added row follows after them.
  const baseCount = fields.sets.length;

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="log_id" value={logId} />
      <input
        type="hidden"
        name="session_id"
        value={fields.sessionId ?? ""}
      />
      <input type="hidden" name="set_count" value={baseCount + addedRows.length} />

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
          <SetRow key={index} set={set} index={index} unit={unit} />
        ))}

        {/* Added movements (issue #358): a set performed but never logged, including one
            the plan never prescribed. Each appears as an ordinary Logged Set on save —
            no "off-plan" badge. */}
        {addedRows.map((row, offset) => (
          <AddedSetRow
            key={row.id}
            index={baseCount + offset}
            kind={row.kind}
            unit={unit}
            onKindChange={(kind) => setRowKind(row.id, kind)}
            onRemove={() => removeRow(row.id)}
          />
        ))}

        <Button
          type="button"
          variant="secondary"
          onClick={addRow}
          className="w-full"
        >
          + Add a set
        </Button>
      </fieldset>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

interface AddedSetRowProps {
  index: number;
  kind: QuantityKind;
  unit: WeightUnit;
  onKindChange: (kind: QuantityKind) => void;
  onRemove: () => void;
}

// A newly added set: pick a movement from the Catalog by name (search-and-create,
// ADR-0033 — the same picker the ad-hoc "Log a movement" flow uses), choose its amount
// kind, then enter the typed Quantity, typed Load, and perceived difficulty any Logged
// Set carries. No hidden Exercise id — the action resolves the name; no "off-plan" badge.
function AddedSetRow({ index, kind, unit, onKindChange, onRemove }: AddedSetRowProps) {
  const prefix = `set-${index}`;
  const rowLabel = `added set ${index + 1}`;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-end gap-2.5">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Movement</span>
          <Input
            name={`${prefix}-movement`}
            placeholder="Bicep Curl"
            aria-label={`Movement name, ${rowLabel}`}
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          onClick={onRemove}
          aria-label={`Remove ${rowLabel}`}
        >
          Remove
        </Button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Quantity</span>
        <Select
          name={`${prefix}-kind`}
          value={kind}
          onChange={(event) => onKindChange(event.target.value as QuantityKind)}
          aria-label={`Quantity kind, ${rowLabel}`}
        >
          <option value="repetitions">Reps</option>
          <option value="distance">Distance</option>
          <option value="duration">Duration</option>
        </Select>
      </label>

      <AddedAmountFields prefix={prefix} kind={kind} rowLabel={rowLabel} />

      <div className="grid grid-cols-[7rem_1fr_5rem] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Load kind</span>
          <Select
            name={`${prefix}-load_kind`}
            defaultValue="bodyweight"
            aria-label={`Load kind, ${rowLabel}`}
          >
            {loadKindOptions(unit).map((option) => (
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
            placeholder="15"
            aria-label={`Load, ${rowLabel}`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">RPE</span>
          <Select name={`${prefix}-rpe`} defaultValue="" aria-label={`RPE, ${rowLabel}`}>
            <option value="">—</option>
            {RPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </label>
      </div>
    </div>
  );
}

// The amount input(s) for an added row, shown by its picked kind (ADR-0032). Blank on
// save, the row was left un-performed and is dropped — the cleared-row behavior.
function AddedAmountFields({
  prefix,
  kind,
  rowLabel,
}: {
  prefix: string;
  kind: QuantityKind;
  rowLabel: string;
}) {
  if (kind === "distance") {
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
            aria-label={`Distance, ${rowLabel}`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Unit</span>
          <Select
            name={`${prefix}-unit`}
            defaultValue="km"
            aria-label={`Distance unit, ${rowLabel}`}
          >
            <option value="km">km</option>
            <option value="mi">mi</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Time (opt.)</span>
          <Input
            name={`${prefix}-duration`}
            placeholder="mm:ss"
            aria-label={`Time, ${rowLabel}`}
          />
        </label>
      </div>
    );
  }

  if (kind === "duration") {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Time</span>
        <Input
          name={`${prefix}-duration`}
          placeholder="mm:ss"
          aria-label={`Duration, ${rowLabel}`}
        />
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono text-[9px] text-text-muted">Reps</span>
      <Input
        name={`${prefix}-reps`}
        type="number"
        min={0}
        aria-label={`Reps, ${rowLabel}`}
      />
    </label>
  );
}
