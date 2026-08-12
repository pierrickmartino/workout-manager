"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

import { submitLog, type LogFormState } from "@/app/sessions/[id]/log/actions";
import { LOAD_KIND_OPTIONS } from "@/lib/load";
import {
  buildLogForm,
  deriveCompletionOutcome,
  prescribedByPosition,
  skippedSetCount,
  type LogPrescriptionGroup,
  type LogSetRow,
} from "@/lib/log-session-form";
import type { ExercisePrescription } from "@/lib/sessions-types";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const RPE_VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

interface LogSessionFormProps {
  sessionId: number;
  prescriptions: ExercisePrescription[];
  today: string;
}

// Records a performance of a Session at per-set fidelity (Q1/Q4). Each prescription expands
// to one row per prescribed set, pre-filled with the prescribed reps/load; each row carries a
// Done toggle (Model B, Q10) — an un-done set is skipped, dropping it from the record and
// leaving its prescribed set un-attempted. Supersets ride through as a cosmetic badge (Q5),
// never touching the flat record. The Completion Outcome is derived live and shown before
// submit (Q8/Q11), replacing the old always-"completed" declaration. The session id and the
// derived outcome ride in hidden fields so the server action targets the right Session and
// records the honest outcome.
export function LogSessionForm({
  sessionId,
  prescriptions,
  today,
}: LogSessionFormProps) {
  const [state, action, pending] = useActionState<LogFormState, FormData>(
    submitLog,
    { error: null },
  );
  const [groups, setGroups] = useState<LogPrescriptionGroup[]>(() =>
    buildLogForm(prescriptions),
  );

  // The derived Completion Outcome and its reason, recomputed from the live Done toggles.
  const { outcome, skipped } = useMemo(() => {
    const prescribed = prescribedByPosition(groups);
    const rows = groups.flatMap((group) => group.rows);
    return {
      outcome: deriveCompletionOutcome(prescribed, rows),
      skipped: skippedSetCount(prescribed, rows),
    };
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
        // An added set seeds from the group's last row (its load kind/value), starts blank on
        // reps, and is Done — it is extra performed work, never a prescribed-set skip.
        const added: LogSetRow = {
          key: `${position}-add-${nextSetNumber}-${group.rows.length}`,
          prescriptionPosition: position,
          exerciseId: group.exerciseId,
          setNumber: nextSetNumber,
          reps: "",
          loadKind: last?.loadKind ?? "absolute",
          loadValue: last?.loadValue ?? "",
          rpe: "",
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

      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <SectionHeader>SETS PERFORMED</SectionHeader>

        {groups.map((group) => (
          <div
            key={group.position}
            className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[15px] font-semibold text-text-primary">
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
                {group.prescribedSets} × {group.repsHint} PRESCRIBED
              </span>
            </div>

            <ol className="flex list-none flex-col gap-2.5 p-0">
              {group.rows.map((row) => (
                <li key={row.key}>
                  <SetRow
                    row={row}
                    repsHint={group.repsHint}
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

// One editable set-row. A Done row submits its `name`d inputs; an un-done (skipped) row
// disables them so they never reach the record (Model B, Q10) and dims to read as skipped.
function SetRow({
  row,
  repsHint,
  canRemove,
  onToggleDone,
  onChange,
  onRemove,
}: {
  row: LogSetRow;
  repsHint: string;
  canRemove: boolean;
  onToggleDone: () => void;
  onChange: (patch: Partial<LogSetRow>) => void;
  onRemove: () => void;
}) {
  const disabled = !row.done;
  return (
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

      {/* A skipped row keeps its values on screen but submits nothing — disabled controls are
          omitted from the FormData, so alignment across the row-parallel arrays holds. */}
      {row.done ? (
        <input type="hidden" name="exercise_id" value={row.exerciseId} />
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Reps</span>
          <Input
            name="reps"
            type="number"
            min={0}
            value={row.reps}
            placeholder={repsHint}
            disabled={disabled}
            onChange={(event) => onChange({ reps: event.target.value })}
            aria-label={`Reps for set ${row.setNumber}`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">RPE</span>
          <Select
            name="rpe"
            value={row.rpe}
            disabled={disabled}
            onChange={(event) => onChange({ rpe: event.target.value })}
            aria-label={`RPE for set ${row.setNumber}`}
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

      {/* Load is a typed value (ADR-0010): pick the kind, then give the value that kind
          carries. Seeded from the prescribed load, both editable per set. */}
      <div className="grid grid-cols-[7rem_1fr] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Load kind</span>
          <Select
            name="load_kind"
            value={row.loadKind}
            disabled={disabled}
            onChange={(event) =>
              onChange({ loadKind: event.target.value as LogSetRow["loadKind"] })
            }
            aria-label={`Load kind for set ${row.setNumber}`}
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
            name="load_value"
            placeholder="70"
            value={row.loadValue}
            disabled={disabled}
            onChange={(event) => onChange({ loadValue: event.target.value })}
            aria-label={`Load for set ${row.setNumber}`}
          />
        </label>
      </div>
    </div>
  );
}
