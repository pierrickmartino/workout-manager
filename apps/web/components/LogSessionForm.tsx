"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "@/components/pulse/icons";

import { submitLog, type LogFormState } from "@/app/sessions/[id]/log/actions";
import type { WeightUnit } from "@/lib/weight-unit";
import {
  buildLogForm,
  deriveCompletionOutcome,
  prescribedByPosition,
  skippedSetCount,
  type LogPrescriptionGroup,
  type LogSetRow,
} from "@/lib/log-session-form";
import {
  rowToSetEntryValues,
  setEntryPatchToRow,
  setEntryPrefix,
  type SetEntryRowMap,
} from "@/lib/set-entry";
import { SetEntry, SetEntryProvider } from "@/components/pulse/set-entry";
import type { ExercisePrescription } from "@/lib/sessions-types";
import { Field } from "@/components/pulse/field";
import { FieldRow, FULL_FIELD_CELL } from "@/components/pulse/field-row";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Where the log flow lands once the log is saved.
const AFTER_LOG_HREF = "/history";

interface LogSessionFormProps {
  sessionId: number;
  prescriptions: ExercisePrescription[];
  today: string;
  // The reader's Weight Unit (#417): each Load pre-fills and is entered in this unit, the
  // picker/placeholder name it, and the server action converts the entry back to kilograms.
  unit: WeightUnit;
}

// Records a performance of a Session at per-set fidelity (Q1/Q4). Each prescription expands
// to one row per prescribed set, pre-filled with the prescribed quantity/load; each row carries
// a Done toggle (Model B, Q10) — an un-done set is skipped, dropping it from the record and
// leaving its prescribed set un-attempted. The set is kind-aware (ADR-0050): a distance
// prescription seeds a distance field (+ optional companion time), a duration prescription a
// hold time, a repetitions prescription the numeric reps as before — so a reused run logs
// through its own plan. Supersets ride through as a cosmetic badge (Q5), never touching the
// flat record. The Completion Outcome is derived live and shown before submit (Q8/Q11).
//
// Rows submit as indexed fields (`set-<i>-…`) under a `set_count` header — the same shape the
// heterogeneous ad-hoc log uses — because a hybrid run-then-squats Session mixes kinds and
// the old row-parallel arrays would misalign. The pure `readLogFormRows`/`buildLoggedSets`
// (lib/log-session-form) read and type the payload; the server action is a thin caller.
export function LogSessionForm({
  sessionId,
  prescriptions,
  today,
  unit,
}: LogSessionFormProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState<LogFormState, FormData>(
    submitLog,
    { error: null },
  );
  const [groups, setGroups] = useState<LogPrescriptionGroup[]>(() =>
    buildLogForm(prescriptions, unit),
  );

  // Once the log is saved, leave for History. The save is a server action returning `ok`
  // rather than redirecting itself, so the client owns the navigation.
  useEffect(() => {
    if (state.ok) router.push(AFTER_LOG_HREF);
  }, [state, router]);

  // The derived Completion Outcome and its reason, recomputed from the live Done toggles.
  const { outcome, skipped } = useMemo(() => {
    const prescribed = prescribedByPosition(groups);
    const rows = groups.flatMap((group) => group.rows);
    return {
      outcome: deriveCompletionOutcome(prescribed, rows),
      skipped: skippedSetCount(prescribed, rows),
    };
  }, [groups]);

  // The flat 0-based index each row submits under (`set-<index>-…`), and the total row count
  // the reader iterates. Rows are numbered across every group in render order, so a hybrid
  // Session's mixed-kind rows never collide.
  const { rowOffsets, rowCount } = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const group of groups) {
      offsets.push(running);
      running += group.rows.length;
    }
    return { rowOffsets: offsets, rowCount: running };
  }, [groups]);

  function updateRow(
    position: number,
    key: string,
    patch: Partial<LogSetRow>,
  ): void {
    setGroups((current) =>
      current.map((group) =>
        group.position !== position
          ? group
          : {
              ...group,
              rows: group.rows.map((row) =>
                row.key === key ? { ...row, ...patch } : row,
              ),
            },
      ),
    );
  }

  function addRow(position: number): void {
    setGroups((current) =>
      current.map((group) => {
        if (group.position !== position) return group;
        const last = group.rows[group.rows.length - 1];
        const nextSetNumber =
          group.rows.reduce((max, row) => Math.max(max, row.setNumber), 0) + 1;
        // An added set seeds from the group's last row (its kind, unit, load), starts blank on
        // the quantity, and is Done — it is extra performed work, never a prescribed-set skip.
        const added: LogSetRow = {
          key: `${position}-add-${nextSetNumber}-${group.rows.length}`,
          prescriptionPosition: position,
          exerciseId: group.exerciseId,
          setNumber: nextSetNumber,
          kind: group.kind,
          reps: "",
          distance: "",
          unit: last?.unit ?? "km",
          duration: "",
          loadKind: last?.loadKind ?? "absolute",
          loadValue: last?.loadValue ?? "",
          showLoad: last?.showLoad ?? group.kind === "repetitions",
          rpe: "",
          note: "",
          done: true,
        };
        return { ...group, rows: [...group.rows, added] };
      }),
    );
  }

  function removeRow(position: number, key: string): void {
    setGroups((current) =>
      current.map((group) =>
        group.position !== position
          ? group
          : { ...group, rows: group.rows.filter((row) => row.key !== key) },
      ),
    );
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="session_id" value={sessionId} />
      {/* The Completion Outcome is derived client-side from the Done toggles (Q8), sent as the
          honest verdict; the server validates it and defaults to completed if absent. */}
      <input type="hidden" name="completion_outcome" value={outcome} />
      {/* Rows submit as indexed `set-<i>-…` fields; the reader walks 0…set_count-1. */}
      <input type="hidden" name="set_count" value={rowCount} />

      {state.error ? <Alert announce tone="error">{state.error}</Alert> : null}

      <Field label="Date performed">
        <Input
          name="performed_on"
          type="date"
          defaultValue={today}
          max={today}
          required
        />
      </Field>

      <fieldset className="flex min-w-0 flex-col gap-4 border-0 p-0">
        <SectionHeader>SETS PERFORMED</SectionHeader>

        {groups.map((group, groupIndex) => (
          <div
            key={group.position}
            className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 break-words font-display text-[15px] font-semibold text-text-primary">
                {group.exerciseName}
              </span>
              {group.superset.group !== null ? (
                <Badge
                  variant="cyan"
                  title="Performed round-major within a superset"
                >
                  SUPERSET {group.superset.memberLabel}
                </Badge>
              ) : null}
              <span className="label-mono ml-auto text-[9px] text-text-muted">
                {group.prescribedSets} × {group.hint} PRESCRIBED
              </span>
            </div>

            <ol className="flex list-none flex-col gap-2.5 p-0">
              {group.rows.map((row, rowIndex) => (
                <li key={row.key}>
                  <SetRow
                    index={rowOffsets[groupIndex] + rowIndex}
                    row={row}
                    hint={group.hint}
                    unit={unit}
                    canRemove={group.rows.length > 1}
                    onToggleDone={() =>
                      updateRow(group.position, row.key, { done: !row.done })
                    }
                    onChange={(patch) =>
                      updateRow(group.position, row.key, patch)
                    }
                    onRemove={() => removeRow(group.position, row.key)}
                  />
                </li>
              ))}
            </ol>

            <button
              type="button"
              onClick={() => addRow(group.position)}
              className="inline-flex items-center gap-1.5 self-start font-mono text-[12px] text-cyan hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Add set
            </button>
          </div>
        ))}
      </fieldset>

      {/* The honest "Will log as…" indicator (Q11): derived, never a silent hardcode, so the
          user sees when a partial log won't count as a completed session. No hard block. */}
      <div className="flex flex-col gap-1 rounded-md border border-border bg-base px-4 py-3">
        <span className="label-mono text-[9px] text-text-muted">WILL LOG AS</span>
        <span className="font-display text-sm font-semibold text-text-primary">
          {outcome === "completed" ? "Completed" : "Incomplete"}
          {skipped > 0 ? (
            <span className="ml-2 font-mono text-[12px] font-normal text-text-muted">
              {skipped} prescribed {skipped === 1 ? "set" : "sets"} skipped
            </span>
          ) : null}
        </span>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save log"}
      </Button>
    </form>
  );
}

// One editable set-row. A Done row submits its indexed inputs; an un-done (skipped) row
// disables its quantity/load inputs so they never reach the record (Model B, Q10) and dims to
// read as skipped. The always-submitted `done`/`exercise_id`/`kind` hidden fields let the
// reader index every row and drop the skipped ones.
function SetRow({
  index,
  row,
  hint,
  unit,
  canRemove,
  onToggleDone,
  onChange,
  onRemove,
}: {
  index: number;
  row: LogSetRow;
  hint: string;
  unit: WeightUnit;
  canRemove: boolean;
  onToggleDone: () => void;
  onChange: (patch: Partial<LogSetRow>) => void;
  onRemove: () => void;
}) {
  const prefix = setEntryPrefix(index);
  const disabled = !row.done;
  return (
    <SetEntryProvider
      values={rowToSetEntryValues(row, LOG_ROW_FIELDS)}
      unit={unit}
      prefix={prefix}
      subject={{ joiner: "for", name: `set ${row.setNumber}` }}
      disabled={disabled}
      onEdit={(patch) => onChange(setEntryPatchToRow(patch, LOG_ROW_FIELDS))}
    >
      <div
        className={`flex flex-col gap-3 rounded-md border border-border/60 p-3 ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleDone}
            aria-pressed={row.done}
            aria-label={`Set ${row.setNumber} ${row.done ? "done" : "skipped"}`}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border ${
              row.done
                ? "border-cyan bg-cyan text-on-accent"
                : "border-border bg-transparent text-text-muted"
            }`}
          >
            {row.done ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
          <span className="label-mono text-[11px] text-text-secondary">
            SET {String(row.setNumber).padStart(2, "0")}
          </span>
          {canRemove ? (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove set ${row.setNumber}`}
              className="ml-auto text-text-muted transition-colors hover:text-magenta"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {/* Always submitted, never disabled: the reader indexes every row by these and drops
            the ones whose `done` is not "true", keeping the indexed fields aligned. */}
        <input type="hidden" name={`${prefix}-done`} value={row.done ? "true" : "false"} />
        <input type="hidden" name={`${prefix}-exercise_id`} value={row.exerciseId} />
        <input type="hidden" name={`${prefix}-kind`} value={row.kind} />

        {/* The amount matching the row's kind (ADR-0050): a distance value + unit + optional
            companion time, a single hold time, or the numeric reps — seeded with the prescribed
            hint as a placeholder, never as an answer the user did not give. The distance block
            asks for the whole line, so the effort picker wraps below it rather than squeezing a
            four-field row onto a phone (ADR-0087). */}
        <FieldRow>
          <SetEntry.Quantity
            durationClassName={FULL_FIELD_CELL}
            rowClassName="basis-full"
            repsPlaceholder={hint}
          />
          <SetEntry.Effort />
        </FieldRow>

        {/* Load is the orthogonal "how hard" axis (ADR-0010/0050): shown by default for reps,
            omitted for a plain run/hold, and opt-in for a loaded carry. */}
        {row.showLoad ? (
          <FieldRow>
            <SetEntry.Load />
          </FieldRow>
        ) : (
          <button
            type="button"
            onClick={() => onChange({ showLoad: true })}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 self-start font-mono text-[12px] text-cyan hover:underline disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add load
          </button>
        )}

        {/* Set Note (ADR-0065, #451): an optional per-set remark. Rides as raw text under
            `set-<i>-note`; the backend length-caps and HTML-escapes it at the write boundary. */}
        <SetEntry.Note placeholder="Optional note (e.g. felt easy)" />
      </div>
    </SetEntryProvider>
  );
}

// This row's keys against the set-entry vocabulary, read in both directions. `showLoad` is
// deliberately absent, and its absence is load-bearing: it is not a field the set submits but a
// disclosure this row owns, so it stays on the row's own patch and cannot arrive through the
// entry contract. `kind` is here for the amount branch to read, and is never raised — this form
// has no kind picker, the kind coming from the Prescription (ADR-0050).
const LOG_ROW_FIELDS: SetEntryRowMap<LogSetRow> = {
  kind: "kind",
  reps: "reps",
  distance: "distance",
  unit: "unit",
  duration: "duration",
  load_kind: "loadKind",
  load_value: "loadValue",
  rpe: "rpe",
  note: "note",
};
