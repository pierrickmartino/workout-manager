"use client";

import { useReducer, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";

import { submitDeploy } from "@/app/protocols/[id]/edit/actions";
import {
  builderMatrix,
  builderReducer,
  initBuilderDraft,
  toDeployPayload,
  type BuilderDraft,
  type BuilderMatrix,
  type DraftPrescription,
  type DraftSession,
  type MatrixCell,
  type PickedExercise,
} from "@/lib/protocol-builder";
import { LOAD_KIND_OPTIONS, type LoadKind } from "@/lib/load";
import type { ProtocolProgress } from "@/lib/protocols-types";
import { cn } from "@/lib/utils";
import { ExerciseLibrary } from "@/components/ExerciseLibrary";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface ProtocolBuilderProps {
  protocol: ProtocolProgress;
}

// The Protocol Builder screen (Module I, ADR-0020). Edits stage in a client-side
// draft via the pure reducer and change nothing live until DEPLOY PROTOCOL sends the
// desired un-performed tail. Performed Sessions render read-only (the frozen prefix,
// enforced again server-side). Leaving the page discards the draft with no effect.
export function ProtocolBuilder({ protocol }: ProtocolBuilderProps) {
  const [draft, dispatch] = useReducer(
    builderReducer,
    protocol,
    initBuilderDraft,
  );
  // Which Session the matrix has open in the Prescription editor. Defaults to the
  // Next (first un-performed) Session, the one the user most likely came to edit.
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    () =>
      protocol.next_session?.session_id ??
      protocol.sessions[0]?.session_id ??
      null,
  );
  const [error, setError] = useState<string | null>(null);
  const [deployed, setDeployed] = useState(false);
  const [pending, startTransition] = useTransition();

  const matrix = builderMatrix(draft);
  const selectedSession =
    draft.sessions.find((session) => session.sessionId === selectedSessionId) ??
    null;

  function onDeploy() {
    setError(null);
    setDeployed(false);
    startTransition(async () => {
      const result = await submitDeploy(draft.protocolId, toDeployPayload(draft));
      if (result.error || !result.protocol) {
        setError(result.error ?? "Could not deploy the protocol.");
        return;
      }
      setDeployed(true);
    });
  }

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PULSE // BUILDER"
        title={<span className="capitalize">{protocol.training_type}</span>}
        action={<Badge variant="cyan">{draft.weeks}W</Badge>}
      />

      <div className="flex items-center justify-between">
        <span className="label-mono text-[11px] capitalize text-cyan">
          {protocol.objective}
        </span>
        <span className="label-mono text-[10px] text-text-muted">
          {matrix.cadenceLabel}
        </span>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {deployed ? (
        <Alert tone="success">Protocol deployed — your changes are live.</Alert>
      ) : null}

      <SessionMatrix
        matrix={matrix}
        selectedSessionId={selectedSessionId}
        onSelect={setSelectedSessionId}
      />

      {selectedSession ? (
        <SessionEditor
          session={selectedSession}
          onEditField={(position, field, value) =>
            dispatch({
              type: "EDIT_PRESCRIPTION",
              sessionId: selectedSession.sessionId,
              position,
              field,
              value,
            })
          }
          onEditLoad={(position, loadKind, loadValue) =>
            dispatch({
              type: "EDIT_LOAD",
              sessionId: selectedSession.sessionId,
              position,
              loadKind,
              loadValue,
            })
          }
          onAdd={(exercise) =>
            dispatch({
              type: "ADD_PRESCRIPTION",
              sessionId: selectedSession.sessionId,
              exercise,
            })
          }
          onRemove={(position) =>
            dispatch({
              type: "REMOVE_PRESCRIPTION",
              sessionId: selectedSession.sessionId,
              position,
            })
          }
          onReorder={(from, to) =>
            dispatch({
              type: "REORDER_PRESCRIPTION",
              sessionId: selectedSession.sessionId,
              from,
              to,
            })
          }
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <Button onClick={onDeploy} disabled={pending} className="w-full">
          {pending ? "Deploying…" : "DEPLOY PROTOCOL"}
        </Button>
        <Link
          href={`/protocols/${protocol.id}`}
          className="text-center label-mono text-[10px] text-text-muted transition-colors hover:text-cyan"
        >
          CANCEL — DISCARD CHANGES
        </Link>
      </div>
    </section>
  );
}

interface SessionMatrixProps {
  matrix: BuilderMatrix;
  selectedSessionId: number | null;
  onSelect: (sessionId: number) => void;
}

// The Protocol's positional Week × session-slot overview (ADR-0021), replacing the
// plain Session list. Rows are weeks; cells are the Sessions occupying that week's
// slots, in order — purely positional, with no weekday or date labels, and each
// row is as wide as the week's *actual* Session count (deloads render narrower).
// Each cell shows its Prescription count; performed Sessions read dimmed and
// locked, distinct from live ones. Selecting a cell opens that Session below.
function SessionMatrix({
  matrix,
  selectedSessionId,
  onSelect,
}: SessionMatrixProps) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader meta={matrix.cadenceLabel}>OVERVIEW</SectionHeader>
      <div className="flex flex-col gap-2">
        {matrix.rows.map((row) => (
          <div key={row.week} className="flex items-center gap-3">
            <span className="w-9 shrink-0 label-mono text-[10px] text-text-muted">
              WK {row.week}
            </span>
            <ul className="flex flex-1 list-none flex-wrap gap-2 p-0">
              {row.cells.map((cell, slotIndex) => (
                <li key={cell.sessionId}>
                  <MatrixCellButton
                    cell={cell}
                    slot={slotIndex + 1}
                    selected={cell.sessionId === selectedSessionId}
                    onSelect={() => onSelect(cell.sessionId)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

interface MatrixCellButtonProps {
  cell: MatrixCell;
  slot: number;
  selected: boolean;
  onSelect: () => void;
}

// One matrix cell: a Session at a week's slot. Renders its Prescription count as
// the headline figure, a positional `SLOT n` (never a weekday) or a lock for a
// performed Session, and highlights when it is the one open in the editor.
function MatrixCellButton({
  cell,
  slot,
  selected,
  onSelect,
}: MatrixCellButtonProps) {
  const count = cell.prescriptionCount;
  const label =
    `Week ${cell.week}, slot ${slot} — ${count} ${count === 1 ? "exercise" : "exercises"}` +
    (cell.performed ? ", performed" : "");
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      className={cn(
        "flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-md border transition-colors",
        selected
          ? "border-cyan ring-2 ring-cyan/30"
          : "border-border hover:border-cyan/50",
        cell.performed
          ? "bg-base/50 text-text-muted opacity-70"
          : "bg-surface text-text-primary",
      )}
    >
      {cell.performed ? (
        <Lock className="h-3 w-3" aria-hidden />
      ) : (
        <span className="label-mono text-[8px] text-text-muted">
          SLOT {slot}
        </span>
      )}
      <span className="font-mono text-[18px] font-bold leading-none">
        {count}
      </span>
      <span className="label-mono text-[8px] text-text-muted">EX</span>
    </button>
  );
}

interface SessionEditorProps {
  session: DraftSession;
  onEditField: (
    position: number,
    field: "sets" | "reps" | "restSeconds" | "tempo",
    value: string | number | null,
  ) => void;
  onEditLoad: (position: number, loadKind: LoadKind, loadValue: string) => void;
  onAdd: (exercise: PickedExercise) => void;
  onRemove: (position: number) => void;
  onReorder: (from: number, to: number) => void;
}

// The Prescription editor for the one Session the matrix has open. Its slot label
// stays positional (Week × slot, no dates, ADR-0021). A performed Session renders
// read-only — the frozen prefix (ADR-0020).
function SessionEditor({
  session,
  onEditField,
  onEditLoad,
  onAdd,
  onRemove,
  onReorder,
}: SessionEditorProps) {
  const locked = session.performed;
  const [libraryOpen, setLibraryOpen] = useState(false);
  const lastPosition = session.prescriptions.length - 1;
  return (
    <Card
      className={`flex flex-col gap-3 p-4 ${locked ? "opacity-70" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-base font-mono text-[13px] font-bold text-cyan">
          W{session.week}
        </span>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="font-display text-[15px] font-semibold text-text-primary">
            Week {session.week}, Slot {session.day}
          </span>
          <span className="label-mono text-[9px] text-text-muted">
            {session.prescriptions.length} EXERCISES
          </span>
        </div>
        {locked ? (
          <Badge variant="muted">
            <Lock className="mr-1 inline h-3 w-3" aria-hidden />
            PERFORMED
          </Badge>
        ) : null}
      </div>

      <ul className="flex flex-col gap-3 border-t border-border pt-3">
        {session.prescriptions.map((prescription, position) => (
          <li key={position}>
            {locked ? (
              <PrescriptionReadOnly prescription={prescription} />
            ) : (
              <div className="flex flex-col gap-2">
                <PrescriptionEditor
                  prescription={prescription}
                  onEditField={(field, value) => onEditField(position, field, value)}
                  onEditLoad={(loadKind, loadValue) =>
                    onEditLoad(position, loadKind, loadValue)
                  }
                />
                <PrescriptionControls
                  name={prescription.exerciseName}
                  canMoveUp={position > 0}
                  canMoveDown={position < lastPosition}
                  onMoveUp={() => onReorder(position, position - 1)}
                  onMoveDown={() => onReorder(position, position + 1)}
                  onRemove={() => onRemove(position)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {locked ? null : (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {libraryOpen ? (
            <ExerciseLibrary
              onPick={(exercise) => {
                onAdd(exercise);
                setLibraryOpen(false);
              }}
            />
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => setLibraryOpen((open) => !open)}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {libraryOpen ? "CLOSE LIBRARY" : "ADD MODULE"}
          </Button>
        </div>
      )}
    </Card>
  );
}

interface PrescriptionControlsProps {
  name: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

// Reorder (up/down) and remove controls for one Prescription in an un-performed
// Session. Reordering here is what the deploy payload carries as the new `position`.
function PrescriptionControls({
  name,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
}: PrescriptionControlsProps) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={!canMoveUp}
        aria-label={`Move ${name} up`}
        onClick={onMoveUp}
      >
        <ArrowUp className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={!canMoveDown}
        aria-label={`Move ${name} down`}
        onClick={onMoveDown}
      >
        <ArrowDown className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-magenta"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

function PrescriptionReadOnly({
  prescription,
}: {
  prescription: DraftPrescription;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate font-sans text-[13px] text-text-secondary">
        {prescription.exerciseName}
      </span>
      <span className="shrink-0 font-mono text-[12px] text-text-muted">
        {prescription.sets} × {prescription.reps}
      </span>
    </div>
  );
}

interface PrescriptionEditorProps {
  prescription: DraftPrescription;
  onEditField: (
    field: "sets" | "reps" | "restSeconds" | "tempo",
    value: string | number | null,
  ) => void;
  onEditLoad: (loadKind: LoadKind, loadValue: string) => void;
}

function PrescriptionEditor({
  prescription,
  onEditField,
  onEditLoad,
}: PrescriptionEditorProps) {
  const name = prescription.exerciseName;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
      <span className="font-display text-[14px] font-semibold text-text-primary">
        {name}
      </span>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Sets</span>
          <Input
            type="number"
            min={1}
            value={prescription.sets}
            aria-label={`Sets for ${name}`}
            onChange={(e) => onEditField("sets", toIntOrZero(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Reps</span>
          <Input
            value={prescription.reps}
            aria-label={`Reps for ${name}`}
            placeholder="8-12"
            onChange={(e) => onEditField("reps", e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">
            Rest (sec)
          </span>
          <Input
            type="number"
            min={0}
            value={prescription.restSeconds ?? ""}
            aria-label={`Rest seconds for ${name}`}
            onChange={(e) =>
              onEditField(
                "restSeconds",
                e.target.value === "" ? null : toIntOrZero(e.target.value),
              )
            }
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Tempo</span>
          <Input
            value={prescription.tempo ?? ""}
            aria-label={`Tempo for ${name}`}
            placeholder="3-1-1"
            onChange={(e) =>
              onEditField("tempo", e.target.value === "" ? null : e.target.value)
            }
          />
        </label>
      </div>

      {/* Load is a typed value (ADR-0010): pick the kind, then give the value that
          kind carries — the same picker the log form uses. */}
      <div className="grid grid-cols-[7rem_1fr] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Load kind</span>
          <Select
            value={prescription.loadKind}
            aria-label={`Load kind for ${name}`}
            onChange={(e) =>
              onEditLoad(e.target.value as LoadKind, prescription.loadValue)
            }
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
            value={prescription.loadValue}
            placeholder="70"
            aria-label={`Load for ${name}`}
            onChange={(e) => onEditLoad(prescription.loadKind, e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

// Parse a numeric input to a non-negative integer, treating blanks/garbage as 0 so
// the draft field stays a number for the reducer.
function toIntOrZero(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
