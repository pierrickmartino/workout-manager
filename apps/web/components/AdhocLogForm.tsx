"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { submitAdhocLog, type AdhocLogFormState } from "@/app/logs/new/actions";
import { loadKindOptions } from "@/lib/load";
import type { WeightUnit } from "@/lib/weight-unit";
import type { QuantityKind } from "@/lib/quantity";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { useNavigationGuard } from "@/components/NavigationGuardProvider";
import { FormDraftRecovery } from "@/components/FormDraftRecovery";
import { useFormDraft } from "@/lib/use-form-draft";
import {
  MAX_DRAFT_ROWS,
  hasUniqueKeys,
  isBoundedDraftString,
  isDraftDate,
  isDraftUuid,
} from "@/lib/form-draft-validation";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface AdhocLogFormProps {
  today: string;
  // The reader's Weight Unit (#417): each Load is entered in this unit and the picker names it;
  // the log action converts the entry back to canonical kilograms.
  unit: WeightUnit;
}

interface SetRow {
  id: number;
  kind: QuantityKind;
  movement: string;
  reps: string;
  distance: string;
  unit: string;
  duration: string;
  loadKind: string;
  loadValue: string;
}

interface AdhocDraft {
  idempotencyKey: string;
  performedOn: string;
  trainingType: string;
  rows: SetRow[];
}

let nextRowId = 0;
function makeRow(kind: QuantityKind): SetRow {
  nextRowId += 1;
  return {
    id: nextRowId,
    kind,
    movement: "",
    reps: "",
    distance: "",
    unit: "km",
    duration: "",
    loadKind: "bodyweight",
    loadValue: "",
  };
}

function isAdhocDraft(value: unknown): value is AdhocDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  if (
    !isDraftDate(draft.performedOn) ||
    !isDraftUuid(draft.idempotencyKey) ||
    !TRAINING_TYPES.some((type) => type === draft.trainingType) ||
    !Array.isArray(draft.rows) ||
    draft.rows.length === 0 ||
    draft.rows.length > MAX_DRAFT_ROWS ||
    !hasUniqueKeys(draft.rows as Array<{ id?: number }>)
  ) return false;
  return draft.rows.every((value) => {
    if (typeof value !== "object" || value === null) return false;
    const row = value as Record<string, unknown>;
    return (
      ["repetitions", "distance", "duration"].includes(String(row.kind)) &&
      ["km", "mi"].includes(String(row.unit)) &&
      ["absolute", "bodyweight", "percent_1rm", "qualitative", "range"]
        .includes(String(row.loadKind)) &&
      ["movement", "reps", "distance", "unit", "duration", "loadKind", "loadValue"]
        .every((field) => isBoundedDraftString(row[field]))
    );
  });
}

// Logs one or more ad-hoc movements outside any Protocol (ADR-0031): pick a training
// type, then add a row per set performed. Each row's amount is a typed Quantity
// (ADR-0032): a rep count, a distance (km/miles, with an optional time), or a duration (a
// hold or a distance-unknown timed effort). Heterogeneous rows coexist in one Logged
// Session — a 6 × 800 m interval session is six distance rows, a run then squats is a
// distance row and a rep row. No Session, no Completion Outcome — a plan-less record.
export function AdhocLogForm(props: AdhocLogFormProps) {
  const { userId, isLoaded } = useAuth();
  if (!isLoaded || !userId) return null;
  return <AccountScopedAdhocLogForm key={userId} {...props} />;
}

function AccountScopedAdhocLogForm({ today, unit }: AdhocLogFormProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState<AdhocLogFormState, FormData>(
    submitAdhocLog,
    { error: null, redirectTo: null },
  );
  const [draft, setDraft] = useState<AdhocDraft>(() => ({
    idempotencyKey: crypto.randomUUID(),
    performedOn: today,
    trainingType: "cardio",
    rows: [makeRow("distance")],
  }));
  // Coarse, sticky dirty tracking for the navigation guard (finding #4): any field edit
  // flips `interacted`, and adding a set past the single starting row is itself work worth
  // guarding. Neither resets, so the guard errs toward an extra confirm over a silent loss.
  const [interacted, setInteracted] = useState(false);
  const isDirty = interacted || draft.rows.length > 1;
  useNavigationGuard(isDirty);

  const restoreDraft = useCallback((restored: AdhocDraft) => {
    nextRowId = Math.max(nextRowId, ...restored.rows.map((row) => row.id));
    setDraft(restored);
    setInteracted(true);
  }, []);
  const { recovery, storageFailed, clearAfterSave } = useFormDraft({
    draftId: "adhoc-log",
    data: draft,
    isDirty,
    validate: isAdhocDraft,
    onRestore: restoreDraft,
  });

  useEffect(() => {
    if (!state.redirectTo) return;
    clearAfterSave();
    router.replace(state.redirectTo);
  }, [clearAfterSave, router, state.redirectTo]);

  const setRowKind = (id: number, kind: QuantityKind) =>
    updateRow(id, { kind });
  const updateRow = (id: number, patch: Partial<SetRow>) => {
    setInteracted(true);
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  };
  const addRow = () => {
    setInteracted(true);
    setDraft((current) => ({ ...current, rows: [...current.rows, makeRow("distance")] }));
  };
  const removeRow = (id: number) =>
    setDraft((current) => ({
      ...current,
      rows: current.rows.length === 1
        ? current.rows
        : current.rows.filter((row) => row.id !== id),
    }));

  return (
    <form
      action={action}
      onChange={() => setInteracted(true)}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="idempotency_key" value={draft.idempotencyKey} />
      <FormDraftRecovery recovery={recovery} storageFailed={storageFailed} />
      {state.error ? <Alert announce tone="error">{state.error}</Alert> : null}

      <Field label="Date performed">
        <Input
          name="performed_on"
          type="date"
          value={draft.performedOn}
          onChange={(event) =>
            setDraft((current) => ({ ...current, performedOn: event.target.value }))
          }
          max={today}
          required
        />
      </Field>

      <Field label="Training type">
        <Select
          name="training_type"
          value={draft.trainingType}
          onChange={(event) =>
            setDraft((current) => ({ ...current, trainingType: event.target.value }))
          }
        >
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
        <input type="hidden" name="set_count" value={draft.rows.length} />

        {draft.rows.map((row, index) => (
          <SetRowFields
            key={row.id}
            index={index}
            row={row}
            unit={unit}
            onKindChange={(kind) => setRowKind(row.id, kind)}
            onChange={(patch) => updateRow(row.id, patch)}
            onRemove={draft.rows.length > 1 ? () => removeRow(row.id) : undefined}
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
  row: SetRow;
  unit: WeightUnit;
  onKindChange: (kind: QuantityKind) => void;
  onChange: (patch: Partial<SetRow>) => void;
  onRemove?: () => void;
}

function SetRowFields({ index, row, unit, onKindChange, onChange, onRemove }: SetRowFieldsProps) {
  const prefix = `set-${index}`;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-end gap-2.5">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Movement</span>
          <Input
            name={`${prefix}-movement`}
            value={row.movement}
            onChange={(event) => onChange({ movement: event.target.value })}
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
          value={row.kind}
          onChange={(event) => onKindChange(event.target.value as QuantityKind)}
          aria-label={`Amount kind, set ${index + 1}`}
        >
          <option value="repetitions">Reps</option>
          <option value="distance">Distance</option>
          <option value="duration">Duration</option>
        </Select>
      </label>

      {row.kind === "distance" ? (
        <DistanceFields prefix={prefix} index={index} row={row} onChange={onChange} />
      ) : row.kind === "duration" ? (
        <DurationFields prefix={prefix} index={index} row={row} onChange={onChange} />
      ) : (
        <RepetitionsFields prefix={prefix} index={index} row={row} onChange={onChange} />
      )}

      {/* Load is a typed value (ADR-0010): pick its kind, then give the value that kind
          carries. Left blank, the set records no load. */}
      <div className="grid grid-cols-[7rem_1fr] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Load kind</span>
          <Select
            name={`${prefix}-load_kind`}
            value={row.loadKind}
            onChange={(event) => onChange({ loadKind: event.target.value })}
            aria-label={`Load kind, set ${index + 1}`}
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
            value={row.loadValue}
            onChange={(event) => onChange({ loadValue: event.target.value })}
            placeholder="0"
            aria-label={`Load, set ${index + 1}`}
          />
        </label>
      </div>
    </div>
  );
}

function RepetitionsFields({ prefix, index, row, onChange }: AmountFieldProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Reps</span>
        <Input
          name={`${prefix}-reps`}
          type="number"
          min={0}
          value={row.reps}
          onChange={(event) => onChange({ reps: event.target.value })}
          aria-label={`Reps, set ${index + 1}`}
        />
      </label>
    </div>
  );
}

interface AmountFieldProps {
  prefix: string;
  index: number;
  row: SetRow;
  onChange: (patch: Partial<SetRow>) => void;
}

function DistanceFields({ prefix, index, row, onChange }: AmountFieldProps) {
  return (
    <div className="grid grid-cols-[1fr_5rem_1fr] gap-2.5">
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Distance</span>
        <Input
          name={`${prefix}-distance`}
          type="number"
          min={0}
          step="any"
          value={row.distance}
          onChange={(event) => onChange({ distance: event.target.value })}
          placeholder="5"
          aria-label={`Distance, set ${index + 1}`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Unit</span>
        <Select
          name={`${prefix}-unit`}
          value={row.unit}
          onChange={(event) => onChange({ unit: event.target.value })}
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
          value={row.duration}
          onChange={(event) => onChange({ duration: event.target.value })}
          placeholder="mm:ss"
          aria-label={`Time, set ${index + 1}`}
        />
      </label>
    </div>
  );
}

function DurationFields({ prefix, index, row, onChange }: AmountFieldProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <label className="flex flex-col gap-1.5">
        {/* A duration is timed, non-locomotion work (a hold, a distance-unknown treadmill
            session): the time is the amount, entered as mm:ss or bare seconds (ADR-0032). */}
        <span className="label-mono text-[9px] text-text-muted">Time</span>
        <Input
          name={`${prefix}-duration`}
          value={row.duration}
          onChange={(event) => onChange({ duration: event.target.value })}
          placeholder="mm:ss"
          aria-label={`Duration, set ${index + 1}`}
        />
      </label>
    </div>
  );
}
