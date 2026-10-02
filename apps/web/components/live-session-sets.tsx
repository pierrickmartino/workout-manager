"use client";

import { memo, useState } from "react";
import { Check, ChevronDown, RotateCcw, SkipForward } from "@/components/pulse/icons";

import { liveSetDomId, type LiveSet, type LiveUnit } from "@/lib/live-session";
import type { LoadKind } from "@/lib/load";
import type { WeightUnit } from "@/lib/weight-unit";
import { setEntryValues, type SetEntryValues } from "@/lib/set-entry";
import { SetEntry, SetEntryProvider } from "@/components/pulse/set-entry";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FieldRow } from "@/components/pulse/field-row";

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
  // The reader's Weight Unit (#417): the per-set Load picker names it. Named `weightUnit`
  // to avoid colliding with the `LiveUnit` values mapped as `unit` below.
  weightUnit: WeightUnit;
}

// The grouped, collapsible set list (issue: always-on live timer + collapse). A
// completed unit renders as a one-line summary (tap to re-expand and review); the
// current and upcoming units render their full set rows so the user's place is never
// hidden. Extracted from LiveSessionScreen to keep that shell small and this list's
// grouping logic cohesive in one file.
//
// Memoized (see the export below): this is the heaviest subtree on the app's most
// re-render-sensitive screen — one card per set, each with its own inputs, select and
// local edit state. Its owner keeps every prop's identity stable across a re-render the
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
          <ExpandedUnit
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

interface ExpandedUnitProps {
  unit: LiveUnit;
  currentIndex: number;
  onCompleteSet: LiveSessionSetsProps["onCompleteSet"];
  onSkipSet: LiveSessionSetsProps["onSkipSet"];
  onReopenSet: LiveSessionSetsProps["onReopenSet"];
  isFinishing: boolean;
  weightUnit: WeightUnit;
}

// An expanded unit: its full set rows, under a lightweight "SUPERSET A" label when
// the unit is a Superset (so its interleaved members read as one group). Solo units
// carry no header — the set rows already name their exercise.
function ExpandedUnit({
  unit,
  currentIndex,
  onCompleteSet,
  onSkipSet,
  onReopenSet,
  isFinishing,
  weightUnit,
}: ExpandedUnitProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {unit.supersetLabel ? (
        <span className="label-mono text-[11px] text-cyan">
          SUPERSET {unit.supersetLabel}
        </span>
      ) : null}
      <ol className="flex list-none flex-col gap-3 p-0">
        {unit.sets.map(({ set, index }) => (
          <li key={liveSetDomId(set)} id={liveSetDomId(set)}>
            <SetRow
              // Keyed on `status` so a reopen remounts the row, re-seeding its inputs
              // from the retained record values rather than whatever was last typed
              // into them. The row's edit state is local `useState` seeded at mount,
              // which does not re-seed on a prop change — so this is deliberate, not
              // incidental: a reopened set must open on the numbers it was completed with.
              key={set.status}
              set={set}
              isCurrent={index === currentIndex}
              weightUnit={weightUnit}
              isFinishing={isFinishing}
              onComplete={(reps, loadKind, loadValue, rpe) =>
                onCompleteSet(index, reps, loadKind, loadValue, rpe)
              }
              onSkip={() => onSkipSet(index)}
              onReopen={() => onReopenSet(index)}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

interface SetRowProps {
  set: LiveSet;
  isCurrent: boolean;
  weightUnit: WeightUnit;
  isFinishing: boolean;
  onComplete: (
    reps: number,
    loadKind: LoadKind,
    loadValue: string,
    rpe: number | null,
  ) => void;
  onSkip: () => void;
  onReopen: () => void;
}

// One prescribed set. Its edited reps/load/RPE live as local input state, seeded
// from the prescription pre-fill; "Complete" folds those values into a
// COMPLETE_SET event. "Skip" leaves the set un-attempted (ADVANCE) — finishing with
// any skipped set records the performance Incomplete (ADR-0013). A completed set is
// not settled: "Reopen" hands it back as un-attempted with its values intact
// (ADR-0089), so a mis-tap or a wrong weight is correctable during the performance
// rather than only afterwards via Log Correction.
function SetRow({
  set,
  isCurrent,
  weightUnit,
  isFinishing,
  onComplete,
  onSkip,
  onReopen,
}: SetRowProps) {
  // The row's edited values, seeded at mount from the prescription pre-fill. Held as the
  // set-entry vocabulary rather than four `useState`s so the shared fields can read them
  // directly; a Live Session set posts nothing, so these are the only copy there is until
  // "Complete" folds them into an event. The `kind` is stated though this surface renders
  // `Reps` directly rather than through `Amount`: a live set is a rep count against its
  // prescription, and recording that is cheaper than leaving the field to be inferred.
  const [entry, setEntry] = useState<SetEntryValues>(() =>
    setEntryValues({
      kind: "repetitions",
      reps: String(set.reps),
      load_kind: set.loadKind,
      load_value: set.loadValue,
      rpe: set.rpe === null ? "" : String(set.rpe),
    }),
  );

  const completed = set.status === "completed";
  const label = `${set.exerciseName}, set ${set.setNumber}`;

  function handleComplete() {
    const repsValue = Number.parseInt(entry.reps, 10);
    const rpeValue = entry.rpe === "" ? null : Number.parseInt(entry.rpe, 10);
    onComplete(
      Number.isInteger(repsValue) && repsValue >= 0 ? repsValue : 0,
      entry.load_kind as LoadKind,
      entry.load_value.trim(),
      rpeValue !== null && Number.isInteger(rpeValue) ? rpeValue : null,
    );
  }

  return (
    <Card
      className={
        completed
          ? "flex flex-col gap-3 border-cyan/40 p-4"
          : isCurrent
            ? "flex flex-col gap-3 border-cyan p-4"
            : "flex flex-col gap-3 p-4"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-base font-mono text-[12px] font-bold text-cyan">
            {set.setNumber}/{set.moduleSetCount}
          </span>
          <span className="min-w-0 break-words font-display text-[15px] font-semibold text-text-primary">
            {set.exerciseName}
          </span>
        </div>
        {completed ? (
          <Badge variant="cyan">
            <Check className="h-3 w-3" aria-hidden />
            DONE
          </Badge>
        ) : null}
      </div>

      <p className="font-mono text-[11px] text-text-muted">
        Prescribed: {set.prescribedReps} reps · {set.prescribedLoadText}
      </p>

      {set.previous ? (
        <p className="font-mono text-[11px] text-cyan">
          Previous: {set.previous.reps} reps · {set.previous.loadText}
        </p>
      ) : null}

      {/* The shared set-entry fields (ADR-0106). The provider sits *inside* the row, not above
          the memoized list: its value is built from this row's own state, so no new context
          value crosses the `memo` boundary that keeps this screen's re-renders down
          (ADR-0091). `prefix` is null because a Live Session is ephemeral and client-side
          until it is finished (ADR-0012) — these fields are in no form. */}
      <SetEntryProvider
        values={entry}
        unit={weightUnit}
        prefix={null}
        subject={{ joiner: "for", name: label }}
        disabled={completed}
        onEdit={(patch) => setEntry((current) => ({ ...current, ...patch }))}
      >
        <FieldRow>
          <SetEntry.Reps />
          <SetEntry.Effort />
        </FieldRow>

        <FieldRow>
          <SetEntry.Load />
        </FieldRow>
      </SetEntryProvider>

      <div className="flex flex-wrap items-center gap-2">
        {completed ? (
          // No confirmation: the act *is* an undo, and re-completing the set restores it
          // exactly, so a dialog here would only tax the recovery path. The label is
          // per-set because a screen of identical rows makes a bare "Reopen" ambiguous.
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReopen}
            disabled={isFinishing}
            aria-label={`Reopen ${label}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reopen
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleComplete}
            >
              <Check className="h-3.5 w-3.5" />
              Complete set
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSkip}
              aria-label={`Skip ${label}`}
            >
              <SkipForward className="h-3.5 w-3.5" />
              Skip
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
