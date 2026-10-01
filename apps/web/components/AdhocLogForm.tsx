"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import { submitAdhocLog, type AdhocLogFormState } from "@/app/logs/new/actions";
import type { WeightUnit } from "@/lib/weight-unit";
import type { QuantityKind } from "@/lib/quantity";
import {
  SET_ENTRY_CARD,
  rowToSetEntryValues,
  setEntryPatchToRow,
  setEntryPrefix,
  type SetEntryRowMap,
} from "@/lib/set-entry";
import { SetEntry, SetEntryProvider } from "@/components/pulse/set-entry";
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
import { FieldRow } from "@/components/pulse/field-row";
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

      <fieldset className="flex min-w-0 flex-col gap-3 border-0 p-0">
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
  onChange: (patch: Partial<SetRow>) => void;
  onRemove?: () => void;
}

// One ad-hoc set: an authored movement, a typed Quantity whose fields follow the picked kind,
// and a typed Load. Every field comes from the shared set-entry family (ADR-0106) — this form
// had its own copy of all of them, and the copies across the four log forms had drifted.
function SetRowFields({ index, row, unit, onChange, onRemove }: SetRowFieldsProps) {
  return (
    <SetEntryProvider
      values={rowToSetEntryValues(row, DRAFT_FIELDS)}
      unit={unit}
      prefix={setEntryPrefix(index)}
      subject={{ joiner: "comma", name: `set ${index + 1}` }}
      onEdit={(patch) => onChange(setEntryPatchToRow(patch, DRAFT_FIELDS))}
    >
      <div className={SET_ENTRY_CARD}>
        <div className="flex items-end gap-2.5">
          <SetEntry.Movement placeholder="Running" required />
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

        <SetEntry.Kind />

        <FieldRow>
          <SetEntry.Quantity />
        </FieldRow>

        {/* Load is a typed value (ADR-0010): pick its kind, then give the value that kind
            carries. Left blank, the set records no load. */}
        <FieldRow>
          <SetEntry.Load placeholder="0" />
        </FieldRow>
      </div>
    </SetEntryProvider>
  );
}

// This draft row's keys against the set-entry vocabulary. The two spellings differ because the
// draft is also what gets persisted for recovery, so it cannot simply adopt the wire's
// `snake_case`. One table, read in both directions — two mapping functions would be free to
// drift, and a field present in one but not the other discards that field's edits in silence.
const DRAFT_FIELDS: SetEntryRowMap<SetRow> = {
  movement: "movement",
  kind: "kind",
  reps: "reps",
  distance: "distance",
  unit: "unit",
  duration: "duration",
  load_kind: "loadKind",
  load_value: "loadValue",
};
