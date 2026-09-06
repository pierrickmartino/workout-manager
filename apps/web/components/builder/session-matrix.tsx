"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Lock,
  Plus,
} from "lucide-react";

import {
  sessionMoveOptions,
  type BuilderDraft,
  type BuilderMatrix,
  type MatrixCell,
} from "@/lib/protocol-builder";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/pulse/section-header";
import { Button } from "@/components/ui/button";

// The always-visible Protocol → Week → Session spine of the Builder overview (ADR-0068).
// Extracted from `ProtocolBuilder.tsx` so the spine and its per-Session move controls
// live in one cohesive file, beside the `prescription-rows` editor it sits above. The
// Session editor (the master–detail *detail* pane) stays in the screen component.

// The sentinel `toIndex` that appends a moved Session to the end of a Week's
// un-performed run (`moveSession` clamps it) — used by the cross-Week move controls,
// which drop the Session at the destination Week's tail.
const APPEND_TO_WEEK = Number.MAX_SAFE_INTEGER;

interface SessionMatrixProps {
  // The live draft, so each un-performed cell can read its own `sessionMoveOptions`.
  draft: BuilderDraft;
  matrix: BuilderMatrix;
  selectedSessionId: number | null;
  onSelect: (sessionId: number) => void;
  onAddSession: (week: number) => void;
  onMoveSession: (sessionId: number, toWeek: number, toIndex: number) => void;
  onAddWeek: () => void;
}

// The always-visible Protocol → Week → Session spine (ADR-0068). The frozen prefix
// (performed Sessions) collapses into a locked, expandable band so settled record stays
// visible without burying the editable tail (ADR-0020). Each un-performed Session cell
// carries its Week/slot label, a move-control cluster — the ADR-0027 keyboard/button
// floor for reordering within and across Weeks — and opens in the editor when selected.
// Weeks are explicit rows, each with its own tail "add Session" insertion point;
// positional only, with no weekday or date labels (ADR-0021).
export function SessionMatrix({
  draft,
  matrix,
  selectedSessionId,
  onSelect,
  onAddSession,
  onMoveSession,
  onAddWeek,
}: SessionMatrixProps) {
  const performedCells = matrix.rows.flatMap((row) =>
    row.cells.filter((cell) => cell.performed),
  );
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader meta={matrix.cadenceLabel}>OVERVIEW</SectionHeader>
      {performedCells.length > 0 ? (
        <FrozenPrefixBand
          cells={performedCells}
          selectedSessionId={selectedSessionId}
          onSelect={onSelect}
        />
      ) : null}
      <div className="flex flex-col gap-2">
        {matrix.rows.map((row) => {
          // The frozen prefix lives in the band above; a Week's editable region shows
          // only its un-performed Sessions. A fully-performed Week renders nothing here.
          const editable = row.cells.filter((cell) => !cell.performed);
          if (editable.length === 0) return null;
          return (
            <div key={row.week} className="flex items-start gap-3">
              <span className="w-9 shrink-0 pt-2 label-mono text-[10px] text-text-muted">
                WK {row.week}
              </span>
              <ul className="flex flex-1 list-none flex-wrap gap-2 p-0">
                {editable.map((cell, slotIndex) => (
                  <li key={cell.sessionId}>
                    <MatrixCellButton
                      cell={cell}
                      slot={slotIndex + 1}
                      selected={cell.sessionId === selectedSessionId}
                      onSelect={() => onSelect(cell.sessionId)}
                      moves={sessionMoveOptions(draft, cell.sessionId)}
                      onMove={onMoveSession}
                    />
                  </li>
                ))}
                <li>
                  <AddSlotButton
                    label={`Add a Session to week ${row.week}`}
                    onClick={() => onAddSession(row.week)}
                  />
                </li>
              </ul>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={onAddWeek}
        className="w-full"
      >
        <Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden />
        ADD WEEK
      </Button>
    </div>
  );
}

interface FrozenPrefixBandProps {
  cells: MatrixCell[];
  selectedSessionId: number | null;
  onSelect: (sessionId: number) => void;
}

// The collapsed, locked band summarizing the frozen prefix (ADR-0068/0020). Default
// collapsed to a "N performed Sessions · locked" summary; expanding reveals the settled
// cells read-only (no move controls, no insertion) — they open in the editor read-only
// when selected, but never reorder. A settled record is never re-rendered as editable.
function FrozenPrefixBand({
  cells,
  selectedSessionId,
  onSelect,
}: FrozenPrefixBandProps) {
  const [open, setOpen] = useState(false);
  const count = cells.length;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-base/40 p-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex items-center gap-2 label-mono text-[10px] text-text-muted transition-colors hover:text-text-primary"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        )}
        <Lock className="h-3 w-3" aria-hidden />
        {count} PERFORMED {count === 1 ? "SESSION" : "SESSIONS"} · LOCKED
      </button>
      {open ? (
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {cells.map((cell) => (
            <li key={cell.sessionId}>
              <MatrixCellButton
                cell={cell}
                slot={cell.day}
                selected={cell.sessionId === selectedSessionId}
                onSelect={() => onSelect(cell.sessionId)}
                moves={null}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// The empty-slot affordance in a matrix row: adds a new, empty un-performed Session
// to that week (ADR-0020). It matches a cell's footprint so the grid reads evenly.
function AddSlotButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-16 w-16 flex-col items-center justify-center rounded-md border border-dashed border-border text-text-muted transition-colors hover:border-cyan/50 hover:text-cyan"
    >
      <Plus className="h-4 w-4" aria-hidden />
      <span className="label-mono text-[8px]">ADD</span>
    </button>
  );
}

interface MatrixCellButtonProps {
  cell: MatrixCell;
  slot: number;
  selected: boolean;
  onSelect: () => void;
  // The Session's legal moves (ADR-0068), or `null` for a performed Session (the frozen
  // prefix carries no move controls). `onMove` is only invoked when `moves` is present.
  moves: ReturnType<typeof sessionMoveOptions>;
  onMove?: (sessionId: number, toWeek: number, toIndex: number) => void;
}

// One Session cell in the spine: its Prescription count as the headline figure, a
// positional `SLOT n` (never a weekday) or a lock for a performed Session, and — for an
// un-performed Session — a move-control cluster beneath it (ADR-0068). Highlights when
// it is the one open in the editor.
function MatrixCellButton({
  cell,
  slot,
  selected,
  onSelect,
  moves,
  onMove,
}: MatrixCellButtonProps) {
  const count = cell.prescriptionCount;
  const label =
    `Week ${cell.week}, slot ${slot} — ${count} ${count === 1 ? "exercise" : "exercises"}` +
    (cell.performed ? ", performed" : "");
  return (
    <div className="flex flex-col items-center gap-1">
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
      {moves && onMove ? (
        <SessionMoveControls cell={cell} moves={moves} onMove={onMove} />
      ) : null}
    </div>
  );
}

interface SessionMoveControlsProps {
  cell: MatrixCell;
  moves: NonNullable<ReturnType<typeof sessionMoveOptions>>;
  onMove: (sessionId: number, toWeek: number, toIndex: number) => void;
}

// The Session-level move cluster (ADR-0068) — the ADR-0027 keyboard/button floor that
// ships whether or not pointer drag is present. Up/down reorder within the Week; the
// Week arrows carry the Session to the previous/next Week's tail. Each control is
// disabled exactly when `sessionMoveOptions` says the move is illegal, so the reducer's
// tail-only guard is never actually exercised by the UI.
function SessionMoveControls({ cell, moves, onMove }: SessionMoveControlsProps) {
  return (
    <div className="flex gap-0.5">
      <MoveButton
        icon={ArrowUp}
        label={`Move this Session earlier in week ${cell.week}`}
        disabled={!moves.canMoveUp}
        onClick={() => onMove(cell.sessionId, moves.week, moves.index - 1)}
      />
      <MoveButton
        icon={ArrowDown}
        label={`Move this Session later in week ${cell.week}`}
        disabled={!moves.canMoveDown}
        onClick={() => onMove(cell.sessionId, moves.week, moves.index + 1)}
      />
      <MoveButton
        icon={ArrowLeft}
        label={`Move this Session to week ${cell.week - 1}`}
        disabled={!moves.canMoveToPrevWeek}
        onClick={() => onMove(cell.sessionId, moves.week - 1, APPEND_TO_WEEK)}
      />
      <MoveButton
        icon={ArrowRight}
        label={`Move this Session to week ${cell.week + 1}`}
        disabled={!moves.canMoveToNextWeek}
        onClick={() => onMove(cell.sessionId, moves.week + 1, APPEND_TO_WEEK)}
      />
    </div>
  );
}

// One move control: a small, always-rendered icon button that disables (never hides)
// when its move is illegal, so the control cluster stays stable as a Session shifts.
function MoveButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof ArrowUp;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-4 w-4 items-center justify-center rounded-sm border border-border text-text-muted transition-colors hover:border-cyan/50 hover:text-cyan disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-text-muted"
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
    </button>
  );
}
