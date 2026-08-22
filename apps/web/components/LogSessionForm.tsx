"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";

import {
  harderVariationForPin,
  submitLog,
  type LogFormState,
} from "@/app/sessions/[id]/log/actions";
import { LOAD_KIND_OPTIONS } from "@/lib/load";
import {
  buildLogForm,
  buildPinDialog,
  collectPinCandidates,
  deriveCompletionOutcome,
  prescribedByPosition,
  skippedSetCount,
  type LogPrescriptionGroup,
  type LogSetRow,
  type PinCandidate,
  type PinDialogModel,
} from "@/lib/log-session-form";
import type { DistanceUnit } from "@/lib/quantity";
import type { ExercisePrescription } from "@/lib/sessions-types";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { PinOfferDialog } from "@/components/PinOfferDialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Where the log flow lands once there is no Pin to offer, or the offer is dismissed.
const AFTER_LOG_HREF = "/history";

const RPE_VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

interface LogSessionFormProps {
  sessionId: number;
  prescriptions: ExercisePrescription[];
  today: string;
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
}: LogSessionFormProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState<LogFormState, FormData>(
    submitLog,
    { error: null },
  );
  const [groups, setGroups] = useState<LogPrescriptionGroup[]>(() =>
    buildLogForm(prescriptions),
  );

  // After the log is saved, offer a Pin dialog for every bodyweight movement that beat the top of
  // its rep range on every working set (ADR-0053, #371). The decision is the view-model's
  // (`collectPinCandidates`, on the rows the form holds); each qualifying movement is offered in
  // turn, so a session where two movements were beaten never silently drops one. When nothing
  // qualifies, the flow proceeds straight to History as before. `offeredRef` seeds the queue once.
  const [pinQueue, setPinQueue] = useState<PinCandidate[]>([]);
  const [pinIndex, setPinIndex] = useState(0);
  const [pinDialog, setPinDialog] = useState<PinDialogModel | null>(null);
  const offeredRef = useRef(false);

  // Seed the offer queue once the log is saved.
  useEffect(() => {
    if (!state.ok || offeredRef.current) return;
    offeredRef.current = true;

    const candidates = collectPinCandidates(prescriptions, groups);
    if (candidates.length === 0) {
      router.push(AFTER_LOG_HREF);
      return;
    }
    setPinQueue(candidates);
  }, [state, prescriptions, groups, router]);

  // Build the dialog for the current queue position — reading its harder-Variation alternative so
  // it can sit beside "raise reps" — and leave for History once every offer is resolved or skipped.
  useEffect(() => {
    if (pinQueue.length === 0) return;
    if (pinIndex >= pinQueue.length) {
      router.push(AFTER_LOG_HREF);
      return;
    }

    let cancelled = false;
    void (async () => {
      const candidate = pinQueue[pinIndex];
      const suggestion = await harderVariationForPin(
        sessionId,
        candidate.prescription.position,
      );
      if (cancelled) return;
      const dialog = buildPinDialog({
        prescription: candidate.prescription,
        performedReps: candidate.performedReps,
        harderVariation: suggestion,
      });
      if (dialog === null) {
        setPinIndex((index) => index + 1);
        return;
      }
      setPinDialog(dialog);
    })();
    return () => {
      cancelled = true;
    };
  }, [pinQueue, pinIndex, router, sessionId]);

  // Move past the current offer — after it is pinned/advanced, or dismissed — to the next one.
  const advancePinOffer = () => {
    setPinDialog(null);
    setPinIndex((index) => index + 1);
  };

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

        {groups.map((group, groupIndex) => (
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

      {/* The post-log Pin offer (ADR-0053, #371): a confirm dialog to Pin a new bodyweight rep
          target, pre-filled and editable, paired with the harder-Variation alternative. Shown only
          for a qualifying log; dismissing (or having nothing to offer) proceeds to History. */}
      {pinDialog !== null ? (
        <PinOfferDialog
          dialog={pinDialog}
          sessionId={sessionId}
          onResolved={advancePinOffer}
          onDismiss={advancePinOffer}
        />
      ) : null}
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
  canRemove,
  onToggleDone,
  onChange,
  onRemove,
}: {
  index: number;
  row: LogSetRow;
  hint: string;
  canRemove: boolean;
  onToggleDone: () => void;
  onChange: (patch: Partial<LogSetRow>) => void;
  onRemove: () => void;
}) {
  const prefix = `set-${index}`;
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

      {/* Always submitted, never disabled: the reader indexes every row by these and drops
          the ones whose `done` is not "true", keeping the indexed fields aligned. */}
      <input type="hidden" name={`${prefix}-done`} value={row.done ? "true" : "false"} />
      <input type="hidden" name={`${prefix}-exercise_id`} value={row.exerciseId} />
      <input type="hidden" name={`${prefix}-kind`} value={row.kind} />

      <div className="grid grid-cols-2 gap-2.5">
        <QuantityField
          prefix={prefix}
          row={row}
          hint={hint}
          disabled={disabled}
          onChange={onChange}
        />
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">RPE</span>
          <Select
            name={`${prefix}-rpe`}
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

      {/* Load is the orthogonal "how hard" axis (ADR-0010/0050): shown by default for reps,
          omitted for a plain run/hold, and opt-in for a loaded carry. */}
      {row.showLoad ? (
        <LoadFields
          prefix={prefix}
          row={row}
          disabled={disabled}
          onChange={onChange}
        />
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
    </div>
  );
}

// The quantity input matching the row's kind (ADR-0050): a distance value + unit + optional
// companion time, a single hold time, or the existing numeric reps.
function QuantityField({
  prefix,
  row,
  hint,
  disabled,
  onChange,
}: {
  prefix: string;
  row: LogSetRow;
  hint: string;
  disabled: boolean;
  onChange: (patch: Partial<LogSetRow>) => void;
}) {
  if (row.kind === "distance") {
    return (
      <div className="col-span-2 grid grid-cols-[1fr_5rem_1fr] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Distance</span>
          <Input
            name={`${prefix}-distance`}
            type="number"
            min={0}
            step="any"
            value={row.distance}
            placeholder="5"
            disabled={disabled}
            onChange={(event) => onChange({ distance: event.target.value })}
            aria-label={`Distance for set ${row.setNumber}`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Unit</span>
          <Select
            name={`${prefix}-unit`}
            value={row.unit}
            disabled={disabled}
            onChange={(event) =>
              onChange({ unit: event.target.value as DistanceUnit })
            }
            aria-label={`Distance unit for set ${row.setNumber}`}
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
            value={row.duration}
            disabled={disabled}
            onChange={(event) => onChange({ duration: event.target.value })}
            aria-label={`Time for set ${row.setNumber}`}
          />
        </label>
      </div>
    );
  }

  if (row.kind === "duration") {
    return (
      <label className="col-span-2 flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Time</span>
        <Input
          name={`${prefix}-duration`}
          placeholder="mm:ss"
          value={row.duration}
          disabled={disabled}
          onChange={(event) => onChange({ duration: event.target.value })}
          aria-label={`Hold time for set ${row.setNumber}`}
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
        value={row.reps}
        placeholder={hint}
        disabled={disabled}
        onChange={(event) => onChange({ reps: event.target.value })}
        aria-label={`Reps for set ${row.setNumber}`}
      />
    </label>
  );
}

// The typed-Load block (ADR-0010): pick the kind, then give the value that kind carries.
// Seeded from the prescribed load, both editable per set.
function LoadFields({
  prefix,
  row,
  disabled,
  onChange,
}: {
  prefix: string;
  row: LogSetRow;
  disabled: boolean;
  onChange: (patch: Partial<LogSetRow>) => void;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2.5">
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Load kind</span>
        <Select
          name={`${prefix}-load_kind`}
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
          name={`${prefix}-load_value`}
          placeholder="70"
          value={row.loadValue}
          disabled={disabled}
          onChange={(event) => onChange({ loadValue: event.target.value })}
          aria-label={`Load for set ${row.setNumber}`}
        />
      </label>
    </div>
  );
}
