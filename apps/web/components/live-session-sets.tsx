"use client";

import { memo, useState } from "react";
import { Check, ChevronDown, SkipForward } from "@/components/pulse/icons";

import { liveSetDomId, type LiveSet, type LiveUnit } from "@/lib/live-session";
import type { LoadKind } from "@/lib/load";
import type { WeightUnit } from "@/lib/weight-unit";
import { setEntryValues, type SetEntryValues } from "@/lib/set-entry";
import {
  setTableView,
  type SetTableMember,
  type SetTableRow,
} from "@/lib/live-set-table";
import { SetEntry, SetEntryProvider } from "@/components/pulse/set-entry";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface LiveSessionSetsProps {
  // The Session's sets grouped into units for display (solo Prescription or whole
  // Superset — ADR-0023), each carrying its collapse/summary state.
  units: LiveUnit[];
  // The current-set pointer, for highlighting the on-deck row.
  currentIndex: number;
  // Completed units the user has re-expanded to review (by `unitIndex`).
  expandedUnits: ReadonlySet<number>;
  onExpandUnit: (unitIndex: number) => void;
  onCompleteSet: (
    index: number,
    reps: number,
    loadKind: LoadKind,
    loadValue: string,
    rpe: number | null,
  ) => void;
  onSkipSet: (index: number) => void;
  // Reopen a completed set (ADR-0089) — hand it back to the user as un-attempted, with
  // its entered values retained, so they can correct it and complete it again.
  onReopenSet: (index: number) => void;
  // A finish is in flight. The outbox has already taken the sets (ADR-0060), so a reopen
  // racing it would change what is being written — the control is disabled until it lands.
  isFinishing: boolean;
  // The reader's Weight Unit (#417): the Load kind picker names it. Named `weightUnit`
  // to avoid colliding with the `LiveUnit` values mapped as `unit` below.
  weightUnit: WeightUnit;
}

// The grouped, collapsible set list (issue: always-on live timer + collapse). A
// completed unit renders as a one-line summary (tap to re-expand and review); the
// current and upcoming units render as a set table — one card per unit, one row per
// set (ADR-0114) — so the user's place is never hidden. Extracted from
// LiveSessionScreen to keep that shell small and this list's grouping logic cohesive
// in one file.
//
// Memoized (see the export below): this is the heaviest subtree on the app's most
// re-render-sensitive screen — a row of inputs per set, and each card's local edit
// state. Its owner keeps every prop's identity stable across a re-render the
// performance did not cause, which is what makes the boundary hold rather than being
// defeated on each render by a fresh array or a fresh arrow.
function LiveSessionSetsList({
  units,
  currentIndex,
  expandedUnits,
  onExpandUnit,
  onCompleteSet,
  onSkipSet,
  onReopenSet,
  isFinishing,
  weightUnit,
}: LiveSessionSetsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {units.map((unit) => {
        // Only a fully-completed unit collapses, and only until re-expanded. The
        // current unit never collapses (it holds the pointer), so the user's place
        // stays visible even at the moment its last set is completed.
        const collapsed =
          unit.isComplete &&
          !unit.containsCurrent &&
          !expandedUnits.has(unit.unitIndex);
        return collapsed ? (
          <CollapsedUnitCard
            key={unit.unitIndex}
            unit={unit}
            onExpand={() => onExpandUnit(unit.unitIndex)}
          />
        ) : (
          <SetTableCard
            key={unit.unitIndex}
            unit={unit}
            currentIndex={currentIndex}
            onCompleteSet={onCompleteSet}
            onSkipSet={onSkipSet}
            onReopenSet={onReopenSet}
            isFinishing={isFinishing}
            weightUnit={weightUnit}
          />
        );
      })}
    </div>
  );
}

export const LiveSessionSets = memo(LiveSessionSetsList);

interface CollapsedUnitCardProps {
  unit: LiveUnit;
  onExpand: () => void;
}

// A fully-completed unit, collapsed to one line so the scroll to the current set
// stays short. Shows the unit's summary ("Back Squat — 3 sets" or "Superset A ·
// Bench Press + Barbell Row — 3 rounds"); tap to re-expand and review the logged
// sets (which stay read-only).
function CollapsedUnitCard({
  unit,
  onExpand,
}: CollapsedUnitCardProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex w-full items-center justify-between gap-3 rounded-sm border border-cyan/40 bg-surface px-4 py-3 text-left opacity-80 transition-opacity hover:opacity-100"
      aria-label={`Expand completed exercise, ${unit.summary}`}
    >
      <span className="flex items-center gap-2.5 font-mono text-[13px] text-text-secondary">
        <Check className="h-3.5 w-3.5 shrink-0 text-cyan" aria-hidden />
        {unit.summary}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
    </button>
  );
}

interface SetTableCardProps {
  unit: LiveUnit;
  currentIndex: number;
  onCompleteSet: LiveSessionSetsProps["onCompleteSet"];
  onSkipSet: LiveSessionSetsProps["onSkipSet"];
  onReopenSet: LiveSessionSetsProps["onReopenSet"];
  isFinishing: boolean;
  weightUnit: WeightUnit;
}

// A row's edited values, by the set's absolute index.
type Entries = Readonly<Record<number, SetEntryValues>>;
type EditSet = (index: number, patch: Partial<SetEntryValues>) => void;

// A set's values as the entry fields hold them, seeded from what the set carries: the
// prescription pre-fill, or — for a completed or reopened set — what it was completed with
// (ADR-0089). Held as the set-entry vocabulary so the shared fields read them directly; a
// Live Session set posts nothing, so these are the only copy there is until a completion
// folds them into an event. The `kind` is stated though no field renders it: a live set is
// a rep count against its prescription.
function seedEntry(set: LiveSet): SetEntryValues {
  return setEntryValues({
    kind: "repetitions",
    reps: String(set.reps),
    load_kind: set.loadKind,
    load_value: set.loadValue,
    rpe: set.rpe === null ? "" : String(set.rpe),
  });
}

// The row every set and the column header share (ADR-0087). Not a grid: each cell states the
// width it asks for, and the row keeps them on one line while the asks fit and wraps when they
// do not. At 320px and 100% text the asks fit with room to spare, and since every row (and the
// header) makes the same asks, its cells grow to the same widths and the columns align down the
// card. At 200% text the asks double while the card keeps its pixels, so a row wraps instead of
// squeezing a reps field to nothing — fixed `rem` tracks did exactly that (2,700 controls at
// 200% left with no room for their value).
const ROW = "flex min-w-0 flex-wrap items-center gap-1.5";
const TAG_CELL = "w-7 shrink-0";
const REPS_CELL = "min-w-0 grow basis-10";
const LOAD_CELL = "min-w-0 grow basis-13";
const RPE_CELL = "min-w-0 grow basis-10";
const ACTION_CELL = "w-9 shrink-0";

// One unit as a set table (ADR-0114): the unit's members — each with its prescription, last
// time and Load kind — then one row per set, a Superset's grouped by round. The rows' edited
// values live here rather than in each row, because a member's Load kind is one pick that
// several rows take.
function SetTableCard({
  unit,
  currentIndex,
  onCompleteSet,
  onSkipSet,
  onReopenSet,
  isFinishing,
  weightUnit,
}: SetTableCardProps): React.JSX.Element {
  const view = setTableView(unit, currentIndex);
  const [entries, setEntries] = useState<Entries>(() =>
    Object.fromEntries(unit.sets.map(({ set, index }) => [index, seedEntry(set)])),
  );
  const edit: EditSet = (index, patch) =>
    setEntries((current) => ({ ...current, [index]: { ...current[index], ...patch } }));

  function complete(index: number) {
    const entry = entries[index];
    const reps = Number.parseInt(entry.reps, 10);
    const rpe = entry.rpe === "" ? null : Number.parseInt(entry.rpe, 10);
    onCompleteSet(
      index,
      Number.isInteger(reps) && reps >= 0 ? reps : 0,
      entry.load_kind as LoadKind,
      entry.load_value.trim(),
      rpe !== null && Number.isInteger(rpe) ? rpe : null,
    );
  }

  return (
    <Card
      data-set-table=""
      className={cn("flex flex-col gap-2.5 p-3", view.holdsCurrent ? "border-cyan" : null)}
    >
      <div className="flex items-start justify-between gap-3">
        {view.supersetLabel ? (
          <h3 className="label-mono pt-1 text-[11px] text-cyan">{view.title}</h3>
        ) : (
          <h3 className="min-w-0 break-words text-pretty font-display text-[15px] font-semibold leading-tight text-text-primary">
            {view.title}
          </h3>
        )}
        <Badge variant={view.done === view.total ? "cyan" : "muted"}>
          {view.done}/{view.total}
        </Badge>
      </div>

      <div className={cn("flex flex-col", view.supersetLabel ? "gap-2.5" : null)}>
        {view.members.map((member) => (
          <MemberLine
            key={member.modulePosition}
            member={member}
            entries={entries}
            edit={edit}
            weightUnit={weightUnit}
            inHand={unit.sets.some(
              ({ set, index }) => index === currentIndex && set.modulePosition === member.modulePosition,
            )}
          />
        ))}
      </div>

      {/* The column header: the captions the row cells do not repeat. Hidden from the
          accessibility tree because every cell already names itself in full ("Reps for
          Ring dip, set 2"). */}
      <div className={cn(ROW, "label-mono text-[9px] text-text-muted")} aria-hidden>
        <span className={cn(TAG_CELL, "text-center")}>{view.supersetLabel ? "" : "SET"}</span>
        <span className={cn(REPS_CELL, "text-center")}>REPS</span>
        <span className={cn(LOAD_CELL, "text-center")}>LOAD</span>
        <span className={cn(RPE_CELL, "text-center")}>RPE</span>
        <span className={ACTION_CELL} />
      </div>

      <div className="flex flex-col gap-1">
        {view.rounds.map(({ round, rows }) => (
          <div key={round ?? 0} className="flex flex-col gap-1">
            {round !== null ? (
              <span className="label-mono flex items-center gap-2 pt-1 text-[9px] text-text-muted">
                ROUND {round}/{view.roundCount}
                <span className="h-px grow bg-border" aria-hidden />
              </span>
            ) : null}
            <ol className="flex list-none flex-col gap-1 p-0">
              {rows.map((row) => (
                <SetTableRowItem
                  key={liveSetDomId(row.set)}
                  row={row}
                  entry={entries[row.index]}
                  edit={edit}
                  weightUnit={weightUnit}
                  isFinishing={isFinishing}
                  onComplete={() => complete(row.index)}
                  onReopen={() => onReopenSet(row.index)}
                />
              ))}
            </ol>
          </div>
        ))}
      </div>

      {view.skip ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => onSkipSet(view.skip!.index)}
            aria-label={view.skip.ariaLabel}
          >
            <SkipForward className="h-3.5 w-3.5" aria-hidden />
            {view.skip.text}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

interface MemberLineProps {
  member: SetTableMember;
  entries: Entries;
  edit: EditSet;
  weightUnit: WeightUnit;
  inHand: boolean;
}

// One member of the unit: its tag and name inside a Superset, its prescription and last time,
// and its Load kind. The kind is asked once per member and applies to the member's sets still
// to do — so the picker is a set-entry row whose values are the first such set and whose edit
// fans out to all of them. A done member's picker is disabled and shows the kind it was
// performed with.
function MemberLine({ member, entries, edit, weightUnit, inHand }: MemberLineProps) {
  const shown = member.pendingIndexes[0] ?? member.indexes[0];
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <div className="flex min-w-0 grow basis-40 items-start gap-2">
        {member.tag ? <RowTag tone={inHand ? "current" : "muted"}>{member.tag}</RowTag> : null}
        <div className="flex min-w-0 flex-col">
          {member.tag ? (
            <span className="break-words font-display text-[14px] font-semibold leading-tight text-text-primary">
              {member.name}
            </span>
          ) : null}
          <p className="font-mono text-[11px]">
            <span data-member-prescription="" className="text-text-muted">
              {member.prescriptionText}
            </span>
            {member.lastText ? (
              <>
                <span className="text-text-muted"> · </span>
                <span data-member-last="" className="text-cyan">
                  {member.lastText}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      {/* A 7.5rem ask that may shrink: beside the name while both fit, on its own line when
          they do not — and never wider than the card, which a fixed width was at 200% text. */}
      <div className="min-w-0 basis-30">
        <SetEntryProvider
          values={entries[shown]}
          unit={weightUnit}
          prefix={null}
          subject={{ joiner: "for", name: member.name }}
          disabled={member.pendingIndexes.length === 0}
          onEdit={(patch) => member.pendingIndexes.forEach((index) => edit(index, patch))}
        >
          <SetEntry.LoadKind />
        </SetEntryProvider>
      </div>
    </div>
  );
}

function RowTag({ tone, children }: { tone: "muted" | "current"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex h-7 min-w-7 shrink-0 items-center justify-center rounded-sm px-1 font-mono text-[11px] font-bold",
        tone === "current" ? "bg-cyan-dim text-cyan" : "bg-base text-text-muted",
      )}
    >
      {children}
    </span>
  );
}

interface SetTableRowItemProps {
  row: SetTableRow;
  entry: SetEntryValues;
  edit: EditSet;
  weightUnit: WeightUnit;
  isFinishing: boolean;
  onComplete: () => void;
  onReopen: () => void;
}

// One prescribed set as one row: its tag, then reps, Load value and RPE through the shared
// set-entry cells (ADR-0106), then its ✓. A completed row is read-only and its filled ✓ is the
// Reopen (ADR-0089): no confirmation, since the act *is* an undo and re-completing restores it
// exactly. The row carries the set's DOM id, which the sticky "Next up" line scrolls to.
function SetTableRowItem({
  row,
  entry,
  edit,
  weightUnit,
  isFinishing,
  onComplete,
  onReopen,
}: SetTableRowItemProps) {
  const { set, isCompleted, isCurrent, subject } = row;
  return (
    <li
      id={liveSetDomId(set)}
      className={cn(
        ROW,
        "rounded-sm py-0.5",
        isCompleted ? "bg-cyan-dim" : null,
        isCurrent ? "outline outline-1 outline-cyan" : null,
      )}
    >
      <span
        className={cn(
          TAG_CELL,
          "text-center font-mono text-[12px] font-bold",
          isCompleted || isCurrent ? "text-cyan" : "text-text-muted",
        )}
      >
        {row.tag}
      </span>
      <SetEntryProvider
        values={entry}
        unit={weightUnit}
        prefix={null}
        subject={{ joiner: "for", name: subject }}
        disabled={isCompleted}
        onEdit={(patch) => edit(row.index, patch)}
      >
        <div className={REPS_CELL}>
          <SetEntry.RepsCell />
        </div>
        <div className={LOAD_CELL}>
          <SetEntry.LoadValueCell />
        </div>
        <div className={RPE_CELL}>
          <SetEntry.EffortCell />
        </div>
      </SetEntryProvider>
      {isCompleted ? (
        <Button
          type="button"
          variant="primary"
          size="icon"
          className={cn(ACTION_CELL, "h-9")}
          onClick={onReopen}
          disabled={isFinishing}
          aria-label={`Reopen ${subject}`}
        >
          <Check className="h-4 w-4" aria-hidden />
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(ACTION_CELL, "h-9")}
          onClick={onComplete}
          aria-label={`Complete ${subject}`}
        >
          <Check className="h-4 w-4" aria-hidden />
        </Button>
      )}
    </li>
  );
}
