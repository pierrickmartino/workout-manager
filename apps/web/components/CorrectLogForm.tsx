"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

import {
  submitCorrection,
  type CorrectLogFormState,
} from "@/app/history/[id]/edit/actions";
import type { CorrectionFormFields, CorrectionSetFields } from "@/lib/log-correction";
import { CARRIED_EFFORT_FIELD, carriedEffortValue } from "@/lib/logged-set";
import type { WeightUnit } from "@/lib/weight-unit";
import type { QuantityKind } from "@/lib/quantity";
import {
  SET_ENTRY_CARD,
  seededSetEntryValues,
  setEntryPrefix,
  type SetEntryFallbacks,
  type SetEntryPreFill,
  type SetEntrySubject,
} from "@/lib/set-entry";
import { SetEntry, SetEntryFormProvider } from "@/components/pulse/set-entry";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { useNavigationGuard } from "@/components/NavigationGuardProvider";
import { FormDraftRecovery } from "@/components/FormDraftRecovery";
import { useFormDraft } from "@/lib/use-form-draft";
import {
  MAX_DRAFT_FIELDS,
  MAX_DRAFT_ROWS,
  isBoundedDraftString,
} from "@/lib/form-draft-validation";
import { Field } from "@/components/pulse/field";
import { FieldRow } from "@/components/pulse/field-row";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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

interface CorrectionDraft {
  values: Record<string, string>;
  addedKinds: QuantityKind[];
}

function serializeForm(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries(
    Array.from(new FormData(form).entries())
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function isCorrectionDraft(value: unknown): value is CorrectionDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  if (
    typeof draft.values !== "object" ||
    draft.values === null ||
    Array.isArray(draft.values)
  ) return false;
  const entries = Object.entries(draft.values);
  if (
    entries.length > MAX_DRAFT_FIELDS ||
    !entries.every(([name, field]) =>
      isBoundedDraftString(name) && isBoundedDraftString(field),
    )
  ) return false;
  return (
    Array.isArray(draft.addedKinds) &&
    draft.addedKinds.length <= MAX_DRAFT_ROWS &&
    draft.addedKinds.every((kind) =>
      ["repetitions", "distance", "duration"].includes(String(kind)),
    )
  );
}

// Every field in this form is seeded from its pre-fill — the recovered draft's value for that
// submitted name, or the record's own — and then owned by the DOM: the form reads its values back
// out of the FormData on save, which is why its rows take the seeded provider. `SetEntryPreFill`
// is that reader's shape, shared so the rows and the field family agree on it.

// A pre-filled row's fallbacks, read through the form's one pre-fill function (ADR-0106). This
// slice edits a set's contents within its existing kind, so the kind rides in a hidden field
// rather than a picker. Clearing the amount drops the set on save.
function setFallbacks(set: CorrectionSetFields): SetEntryFallbacks {
  return {
    kind: set.kind,
    reps: set.reps,
    distance: set.distance,
    unit: set.unit,
    duration: set.duration,
    // A record with no Load kind on file reads as absolute, the kind a bare weight means.
    load_kind: set.loadKind || "absolute",
    load_value: set.loadValue,
    rpe: set.perceivedDifficulty,
    note: set.note,
  };
}

function SetRow({
  set,
  index,
  unit,
  initial,
}: {
  set: CorrectionSetFields;
  index: number;
  unit: WeightUnit;
  initial: SetEntryPreFill;
}) {
  const prefix = setEntryPrefix(index);
  const subject: SetEntrySubject = { joiner: "for", name: set.exerciseName };
  return (
    <SetEntryFormProvider
      values={seededSetEntryValues(prefix, setFallbacks(set), initial)}
      unit={unit}
      prefix={prefix}
      subject={subject}
    >
      <div className={SET_ENTRY_CARD}>
        <input type="hidden" name={`${prefix}-exercise_id`} value={set.exerciseId} />
        <input type="hidden" name={`${prefix}-kind`} value={set.kind} />
        {/* The record's typed Effort rides back so an untouched RIR or half-step value
            survives the full replace (ADR-0115); nothing renders it. */}
        {set.carriedEffort ? (
          <input
            type="hidden"
            name={`${prefix}-${CARRIED_EFFORT_FIELD}`}
            value={carriedEffortValue(set.carriedEffort)}
          />
        ) : null}
        <span className="min-w-0 break-words font-display text-[15px] font-semibold text-text-primary">
          {set.exerciseName}
        </span>

        {/* The distance block asks for the whole line, so the effort picker wraps below it
            rather than squeezing a four-field row onto a phone (ADR-0087). */}
        <FieldRow>
          <SetEntry.Quantity rowClassName="basis-full" />
          <SetEntry.Effort />
        </FieldRow>

        {/* Load is a typed value (ADR-0010): the picked kind is sent as-is so the record
            keeps the load's meaning at the boundary. */}
        <FieldRow>
          <SetEntry.Load />
        </FieldRow>

        {/* Set Note (ADR-0065, #451): editable per-set remark, pre-filled decoded from the
            record. Rides as raw text; the backend re-escapes it once on save. */}
        <SetEntry.Note placeholder="Optional note (e.g. left knee twinge)" />
      </div>
    </SetEntryFormProvider>
  );
}

// Edit an existing Logged Session's contents (ADR-0034). Every field is pre-filled from
// the record; the form full-replaces its sets on save. A plan-backed record's training
// type is derived from its Session, so it is shown read-only and not sent; a plan-less
// record's is an editable picker. The hidden `log_id`/`session_id` carry identity the
// backend treats as authoritative (the Session is never re-parented).
export function CorrectLogForm(props: CorrectLogFormProps) {
  const { userId, isLoaded } = useAuth();
  if (!isLoaded || !userId) return null;
  return <AccountScopedCorrectLogForm key={userId} {...props} />;
}

function AccountScopedCorrectLogForm({
  logId,
  fields,
  today,
  unit,
}: CorrectLogFormProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState<CorrectLogFormState, FormData>(
    submitCorrection,
    { error: null, redirectTo: null },
  );
  const [addedRows, setAddedRows] = useState<AddedRow[]>([]);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [draftRevision, setDraftRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  // A monotonic source of React keys for added rows, scoped to this form instance so ids
  // never leak between mounts. Bumped only when a row is added.
  const nextRowId = useRef(0);
  const isPlanLess = fields.sessionId === null;

  // Coarse, sticky dirty tracking for the navigation guard (finding #4): the baseline is
  // the pre-filled record, so opening and saving nothing is clean. Any field edit flips
  // `interacted`, and any added row is unsaved work; neither resets. This errs toward a
  // harmless extra confirm rather than silently dropping a correction in progress.
  const [interacted, setInteracted] = useState(false);
  const isDirty = interacted || addedRows.length > 0;
  useNavigationGuard(isDirty);

  const restoreDraft = useCallback((restored: CorrectionDraft) => {
    nextRowId.current = restored.addedKinds.length;
    setAddedRows(restored.addedKinds.map((kind, index) => ({ id: index + 1, kind })));
    setDraftValues(restored.values);
    setDraftRevision((current) => current + 1);
    setInteracted(true);
  }, []);
  const draft = { values: draftValues, addedKinds: addedRows.map((row) => row.kind) };
  const { recovery, storageFailed, clearAfterSave } = useFormDraft({
    draftId: `correction:${logId}`,
    data: draft,
    isDirty,
    validate: isCorrectionDraft,
    onRestore: restoreDraft,
  });

  useEffect(() => {
    if (!interacted || !formRef.current) return;
    setDraftValues(serializeForm(formRef.current));
  }, [addedRows, interacted]);

  useEffect(() => {
    if (!state.redirectTo) return;
    clearAfterSave();
    router.replace(state.redirectTo);
  }, [clearAfterSave, router, state.redirectTo]);

  const initial = (name: string, fallback: string | number | null | undefined) =>
    draftValues[name] ?? String(fallback ?? "");

  const addRow = () => {
    nextRowId.current += 1;
    const id = nextRowId.current;
    setInteracted(true);
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
    <form
      key={draftRevision}
      ref={formRef}
      action={action}
      onChange={(event) => {
        setInteracted(true);
        setDraftValues(serializeForm(event.currentTarget));
      }}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="log_id" value={logId} />
      <input
        type="hidden"
        name="session_id"
        value={fields.sessionId ?? ""}
      />
      <input type="hidden" name="set_count" value={baseCount + addedRows.length} />

      <FormDraftRecovery recovery={recovery} storageFailed={storageFailed} />
      {state.error ? <Alert announce tone="error">{state.error}</Alert> : null}

      <Field label="Date performed">
        <Input
          name="performed_on"
          type="date"
          defaultValue={initial("performed_on", fields.performedOn)}
          max={today}
          required
        />
      </Field>

      <Field label="Duration (seconds)" hint="Leave blank if it wasn’t timed.">
        <Input
          name="duration_seconds"
          type="number"
          min={0}
          defaultValue={initial("duration_seconds", fields.durationSeconds)}
        />
      </Field>

      {isPlanLess ? (
        <Field label="Training type">
          <Select
            name="training_type"
            defaultValue={initial("training_type", fields.trainingType)}
          >
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

      <fieldset className="flex min-w-0 flex-col gap-3 border-0 p-0">
        <SectionHeader>SETS PERFORMED</SectionHeader>
        {fields.sets.map((set, index) => (
          <SetRow
            key={index}
            set={set}
            index={index}
            unit={unit}
            initial={initial}
          />
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
            initial={initial}
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

// An added row starts empty, on a rep count, with a bodyweight Load and kilometres as the
// distance unit — so the only pre-fill that can exist for one is a recovered draft's.
const ADDED_ROW_FALLBACKS: SetEntryFallbacks = {
  movement: "",
  reps: "",
  distance: "",
  unit: "km",
  duration: "",
  load_kind: "bodyweight",
  load_value: "",
  rpe: "",
  note: "",
};

interface AddedSetRowProps {
  index: number;
  kind: QuantityKind;
  unit: WeightUnit;
  initial: SetEntryPreFill;
  onKindChange: (kind: QuantityKind) => void;
  onRemove: () => void;
}

// A newly added set: pick a movement from the Catalog by name (search-and-create,
// ADR-0033 — the same picker the ad-hoc "Log a movement" flow uses), choose its Quantity
// kind, then enter the typed Quantity, typed Load, and perceived difficulty any Logged
// Set carries. No hidden Exercise id — the action resolves the name; no "off-plan" badge.
function AddedSetRow({
  index,
  kind,
  unit,
  initial,
  onKindChange,
  onRemove,
}: AddedSetRowProps) {
  const prefix = setEntryPrefix(index);
  const rowLabel = `added set ${index + 1}`;

  return (
    <SetEntryFormProvider
      // The picked kind is the one value this row holds in React state — it decides which
      // Quantity fields exist, so the row has to re-render when it changes. It therefore
      // overrides the seed rather than being read back out of the DOM.
      values={{ ...seededSetEntryValues(prefix, ADDED_ROW_FALLBACKS, initial), kind }}
      unit={unit}
      prefix={prefix}
      subject={{ joiner: "comma", name: rowLabel }}
      onKindChange={onKindChange}
    >
      <div className={SET_ENTRY_CARD}>
        <div className="flex items-end gap-2.5">
          <SetEntry.Movement placeholder="Bicep Curl" />
          <Button
            type="button"
            variant="ghost"
            onClick={onRemove}
            aria-label={`Remove ${rowLabel}`}
          >
            Remove
          </Button>
        </div>

        <SetEntry.Kind />

        {/* The amount input(s) for the picked kind (ADR-0032). Blank on save, the row was
            left un-performed and is dropped — the cleared-row behaviour. */}
        <FieldRow>
          <SetEntry.Quantity />
        </FieldRow>

        <FieldRow>
          <SetEntry.Load placeholder="15" />
          <SetEntry.Effort />
        </FieldRow>

        {/* Set Note (ADR-0065, #451): optional per-set remark on the added set, sent raw. */}
        <SetEntry.Note placeholder="Optional note" />
      </div>
    </SetEntryFormProvider>
  );
}
