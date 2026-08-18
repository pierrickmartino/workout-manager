"use client";

import { useState } from "react";
import { Check, ChevronDown, SkipForward } from "lucide-react";

import { liveSetDomId, type LiveSet, type LiveUnit } from "@/lib/live-session";
import { LOAD_KIND_OPTIONS, type LoadKind } from "@/lib/load";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const RPE_VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

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
}

// The grouped, collapsible set list (issue: always-on live timer + collapse). A
// completed unit renders as a one-line summary (tap to re-expand and review); the
// current and upcoming units render their full set rows so the user's place is never
// hidden. Extracted from LiveSessionScreen to keep that shell small and this list's
// grouping logic cohesive in one file.
export function LiveSessionSets({
  units,
  currentIndex,
  expandedUnits,
  onExpandUnit,
  onCompleteSet,
  onSkipSet,
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
          />
        );
      })}
    </div>
  );
}

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
}

// An expanded unit: its full set rows, under a lightweight "SUPERSET A" label when
// the unit is a Superset (so its interleaved members read as one group). Solo units
// carry no header — the set rows already name their exercise.
function ExpandedUnit({
  unit,
  currentIndex,
  onCompleteSet,
  onSkipSet,
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
              set={set}
              isCurrent={index === currentIndex}
              onComplete={(reps, loadKind, loadValue, rpe) =>
                onCompleteSet(index, reps, loadKind, loadValue, rpe)
              }
              onSkip={() => onSkipSet(index)}
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
  onComplete: (
    reps: number,
    loadKind: LoadKind,
    loadValue: string,
    rpe: number | null,
  ) => void;
  onSkip: () => void;
}

// One prescribed set. Its edited reps/load/RPE live as local input state, seeded
// from the prescription pre-fill; "Complete" folds those values into a
// COMPLETE_SET event (the engine's only editing path). "Skip" leaves the set
// un-attempted (ADVANCE) — finishing with any skipped set records the performance
// Incomplete (ADR-0013).
function SetRow({ set, isCurrent, onComplete, onSkip }: SetRowProps) {
  const [reps, setReps] = useState(String(set.reps));
  const [loadKind, setLoadKind] = useState<LoadKind>(set.loadKind);
  const [loadValue, setLoadValue] = useState(set.loadValue);
  const [rpe, setRpe] = useState(set.rpe === null ? "" : String(set.rpe));

  const completed = set.status === "completed";
  const label = `${set.exerciseName}, set ${set.setNumber}`;

  function handleComplete() {
    const repsValue = Number.parseInt(reps, 10);
    const rpeValue = rpe === "" ? null : Number.parseInt(rpe, 10);
    onComplete(
      Number.isInteger(repsValue) && repsValue >= 0 ? repsValue : 0,
      loadKind,
      loadValue.trim(),
      rpeValue !== null && Number.isInteger(rpeValue) ? rpeValue : null,
    );
  }

  return (
    <Card
      className={
        completed
          ? "flex flex-col gap-3 border-cyan/40 bg-surface p-4 opacity-80"
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
          <span className="font-display text-[15px] font-semibold text-text-primary">
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
        <p className="font-mono text-[11px] text-cyan/80">
          Previous: {set.previous.reps} reps · {set.previous.loadText}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Reps</span>
          <Input
            type="number"
            min={0}
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            disabled={completed}
            aria-label={`Reps for ${label}`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">RPE</span>
          <Select
            value={rpe}
            onChange={(event) => setRpe(event.target.value)}
            disabled={completed}
            aria-label={`RPE for ${label}`}
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

      <div className="grid grid-cols-[7rem_1fr] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">
            Load kind
          </span>
          <Select
            value={loadKind}
            onChange={(event) => setLoadKind(event.target.value as LoadKind)}
            disabled={completed}
            aria-label={`Load kind for ${label}`}
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
            value={loadValue}
            onChange={(event) => setLoadValue(event.target.value)}
            disabled={completed}
            placeholder="70"
            aria-label={`Load for ${label}`}
          />
        </label>
      </div>

      {!completed ? (
        <div className="flex items-center gap-2">
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
        </div>
      ) : null}
    </Card>
  );
}
