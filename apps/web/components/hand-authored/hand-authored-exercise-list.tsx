"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Link2, Trash2, Unlink } from "@/components/pulse/icons";

import { renderRuns, type PlanExerciseRow } from "@/lib/hand-authored-draft";
import type { SupersetSlot } from "@/lib/hand-authored-session";
import { authoredRowPatch, prescriptionControlSet } from "@/lib/prescription-controls";
import type { WeightUnit } from "@/lib/weight-unit";
import { ExerciseLibrary } from "@/components/ExerciseLibrary";
import { SessionCompositionStrip } from "@/components/builder/session-composition-strip";
import { PrescriptionFieldStack } from "@/components/prescription/PrescriptionFieldStack";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { HandAuthoredExercises } from "./use-hand-authored-exercises";

interface HandAuthoredExerciseListProps<T extends PlanExerciseRow> {
  editor: HandAuthoredExercises<T>;
  unit: WeightUnit;
  // The record half of each exercise card, keyed by row key: the Log form's performed sets.
  // A plan-only form passes none, and its cards carry the plan alone.
  records?: ReadonlyMap<number, ReactNode>;
}

// The exercise list both Hand-Authored forms share (audit C-1): the composition strip, each
// exercise's plan card (Superset members bracketed into one box, ADR-0023), and the catalog
// picker, which is search-and-create (ADR-0033). Grouping rides on the authored plan; the
// record stays sets-only.
export function HandAuthoredExerciseList<T extends PlanExerciseRow>({
  editor,
  unit,
  records,
}: HandAuthoredExerciseListProps<T>) {
  const { exercises, effectiveExercises, layout } = editor;
  const lastIndex = effectiveExercises.length - 1;

  const card = (index: number) => {
    const row = effectiveExercises[index];
    return (
      <ExerciseCard
        key={row.key}
        anchorId={`authored-exercise-${index}`}
        row={row}
        slot={layout[index]}
        unit={unit}
        canMoveUp={index > 0 && editor.canMove(index, index - 1)}
        canMoveDown={index < lastIndex && editor.canMove(index, index + 1)}
        onRemove={() => editor.removeExercise(row.key)}
        onChange={(patch) => editor.updateExercise(row.key, patch)}
        onGroupWithNext={() => editor.groupWithNext(index)}
        onMoveUp={() => editor.moveExercise(index, index - 1)}
        onMoveDown={() => editor.moveExercise(index, index + 1)}
      >
        {records?.get(row.key)}
      </ExerciseCard>
    );
  };

  return (
    // `min-w-0` is load-bearing, not tidying (ADR-0085): the UA stylesheet gives every
    // `fieldset` `min-inline-size: min-content`, which `border-0 p-0` does not override. A single
    // `nowrap` descendant therefore sized this box to the full width of an exercise name and
    // carried the whole document past the viewport.
    <fieldset className="flex min-w-0 flex-col gap-4 border-0 p-0">
      <SectionHeader>EXERCISES</SectionHeader>

      {exercises.length === 0 ? (
        <p className="font-mono text-[12px] text-text-muted">
          Search the catalog below to add the exercises you trained.
        </p>
      ) : null}

      {/* The visible workout composition (ADR-0074, idea 5): a Section-grouped strip above the
          editable exercises. Drag a tile to reorder, tap to focus its card. */}
      <SessionCompositionStrip
        exercises={effectiveExercises.map((row) => ({
          exerciseName: row.exerciseName,
          sets: row.sets,
          reps: row.reps,
          setType: row.setType,
          quantityKind: row.kind,
        }))}
        layout={layout}
        selectedPosition={editor.selectedPosition}
        onSelect={editor.focusExercise}
        onReorder={editor.moveExercise}
      />

      {renderRuns(layout).map((run) => {
        if (run.kind === "solo") return card(run.index);
        const opener = run.indices[0];
        const closer = run.indices[run.indices.length - 1];
        return (
          <SupersetContainer
            key={`superset-${run.group}`}
            roundRestSeconds={effectiveExercises[closer].roundRestSeconds}
            onChangeRoundRest={(value) => editor.setRoundRest(opener, value)}
            onUngroup={() => editor.ungroupAt(opener)}
          >
            {run.indices.map(card)}
          </SupersetContainer>
        );
      })}

      <ExerciseLibrary onPick={editor.addExercise} onCreate={editor.createExercise} />
    </fieldset>
  );
}

// The bordered container that brackets a Superset's members into one visible group, with the
// group-owned round-rest and an ungroup control (ADR-0023). The round-rest belongs to the group,
// not any one member, so it lives here once — never on the individual rows.
function SupersetContainer({
  roundRestSeconds,
  onChangeRoundRest,
  onUngroup,
  children,
}: {
  roundRestSeconds: number | null;
  onChangeRoundRest: (value: number | null) => void;
  onUngroup: () => void;
  children: ReactNode;
}) {
  // Border and cyan label only: an accent wash would composite under every field
  // inside the group, which no declared pairing covers (ADR-0086).
  return (
    <div className="flex flex-col gap-3 rounded-md border border-cyan/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="label-mono text-[10px] text-cyan">SUPERSET</span>
        <Button
          type="button"
          variant="ghost"
          onClick={onUngroup}
          aria-label="Ungroup superset"
        >
          <Unlink className="h-4 w-4" />
          Ungroup
        </Button>
      </div>

      {children}

      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">
          Round rest (sec)
        </span>
        <Input
          type="number"
          min={0}
          value={roundRestSeconds === null ? "" : String(roundRestSeconds)}
          placeholder="120"
          onChange={(event) => {
            const raw = event.target.value.trim();
            const parsed = raw === "" ? null : Number(raw);
            onChangeRoundRest(
              parsed !== null && Number.isInteger(parsed) && parsed >= 0
                ? parsed
                : null,
            );
          }}
          aria-label="Round rest seconds for this superset"
        />
      </label>
    </div>
  );
}

interface ExerciseCardProps {
  // A stable anchor so the composition strip (ADR-0074) can scroll a tapped tile's card into
  // view — "select a tile → focus its exercise" (idea 5).
  anchorId: string;
  row: PlanExerciseRow;
  slot: SupersetSlot;
  unit: WeightUnit;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<PlanExerciseRow>) => void;
  onGroupWithNext: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  // The record half, below the plan: the Log form's performed sets. Absent on a plan-only form.
  children?: ReactNode;
}

function ExerciseCard({
  anchorId,
  row,
  slot,
  unit,
  canMoveUp,
  canMoveDown,
  onRemove,
  onChange,
  onGroupWithNext,
  onMoveUp,
  onMoveDown,
  children,
}: ExerciseCardProps) {
  return (
    <Card id={anchorId} className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {slot.memberLabel ? (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-cyan-dim font-mono text-[11px] font-bold text-cyan"
              aria-label={`Superset member ${slot.memberLabel}`}
            >
              {slot.memberLabel}
            </span>
          ) : null}
          {/* An authored name is never truncated (ADR-0085), so it wraps — and breaks inside a
              word when the word itself cannot fit, which is the only thing that keeps an
              unbroken 100-character name from setting this card's min-content width. */}
          <h3 className="min-w-0 break-words text-balance font-display text-base font-bold text-text-primary">
            {row.exerciseName}
          </h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label={`Move ${row.exerciseName} up`}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label={`Move ${row.exerciseName} down`}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onRemove}
            aria-label={`Remove ${row.exerciseName}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* The authored plan — the one shared, presentation-only field stack every authoring
          surface renders (ADR-0067, #464). The Hand-Authored preset authors every control; a
          grouped member's own rest is dormant while grouped and restored on ungroup (ADR-0023),
          and the composition strip above already shows the warm-up band, so the row drops its
          warm-up chip (ADR-0074, ADR-0129). */}
      <PrescriptionFieldStack
        exerciseName={row.exerciseName}
        weightUnit={unit}
        controls={prescriptionControlSet("handAuthored", { grouped: slot.group !== null })}
        value={{
          kind: row.kind,
          unit: row.unit,
          sets: row.sets,
          target: row.reps,
          restSeconds: row.restSeconds,
          tempo: row.tempo,
          setType: row.setType,
          targetEffortScale: row.targetEffortScale,
          targetEffortValue: row.targetEffortValue,
          note: row.note,
          loadKind: row.loadKind,
          loadValue: row.loadValue,
        }}
        // Picking Duration/Distance re-defaults the plan's Load kind for that Quantity
        // (bodyweight for a hold or a run, absolute for reps) — still overridable.
        onChange={(edit) => onChange(authoredRowPatch(edit))}
      />

      {children}

      {/* Group this exercise with the next into a Superset (ADR-0023). Shown only when a
          next exercise exists to group with, and it is not already the same group. */}
      {slot.canGroupWithNext ? (
        <Button
          type="button"
          variant="secondary"
          onClick={onGroupWithNext}
          className="w-full"
          aria-label={`Group ${row.exerciseName} with the next exercise into a superset`}
        >
          <Link2 className="h-4 w-4" />
          Group with next
        </Button>
      ) : null}
    </Card>
  );
}
