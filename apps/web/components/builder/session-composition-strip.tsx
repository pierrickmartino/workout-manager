"use client";

import { GripVertical, Link2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  sectionBands,
  type Sectionable,
  type SessionSectionKey,
} from "@/lib/session-section";
import { type SupersetSlot } from "@/lib/supersets";
import { cn } from "@/lib/utils";

// The Session composition strip (CONTEXT: Session Section; ADR-0074) — the "visible workout
// composition" above the editable exercises (creative-directions idea 5). It groups the
// Session into its read-time Sections (warm-up / main work / accessory / cooldown), one
// labeled tile per Exercise, brackets Superset members with their shared round instruction,
// focuses a tile's editable Prescription on tap, and — when `onReorder` is given — lets a
// tile be dragged to reorder. Because Sections are *derived* (ADR-0074), dragging a tile
// changes its position, and warm-up (front) / cooldown (back) fall out of the new order; the
// bands re-derive. Superset grouping stays on the rows: a drag that would split a group is a
// no-op upstream (the reorder is contiguity-preserving). Pure presentation over the caller's
// draft — the sectioning and bracketing are the tested view-models.

// The minimal shape a tile needs: the sectioning signals (`Sectionable`: exerciseName /
// setType / quantityKind) plus what the tile prints. Both the Protocol Builder's
// `DraftPrescription` and the Hand-Authored form's `ExerciseRow` satisfy it.
export interface StripExercise extends Sectionable {
  exerciseName: string;
  sets: string | number;
  reps: string;
  setType: string | null;
  quantityKind?: string | null;
}

interface SessionCompositionStripProps {
  exercises: StripExercise[];
  // The per-exercise Superset layout (`supersetLayout(...)`), so the strip brackets the same
  // groups the editor does, from one source of truth.
  layout: SupersetSlot[];
  selectedPosition: number | null;
  onSelect: (position: number) => void;
  // Reorder one exercise from → to (contiguity-preserving upstream). When present, each tile
  // grows a drag handle; when absent (e.g. a performed, locked Session), the strip is static.
  onReorder?: (from: number, to: number) => void;
}

interface SectionMeta {
  label: string;
  text: string;
  dot: string;
  bar: string;
}

// Presentation only — the section→colour mapping. The four keys come from the projection;
// labels and accent tokens are the frontend's (all real PULSE tokens). Literal class strings
// so Tailwind can see them.
const SECTION_META: Record<SessionSectionKey, SectionMeta> = {
  warm_up: { label: "WARM-UP", text: "text-amber", dot: "bg-amber", bar: "bg-amber-dim" },
  main: { label: "MAIN WORK", text: "text-cyan", dot: "bg-cyan", bar: "bg-cyan-dim" },
  accessory: {
    label: "ACCESSORIES",
    text: "text-violet",
    dot: "bg-violet",
    bar: "bg-violet-dim",
  },
  cooldown: { label: "COOLDOWN", text: "text-green", dot: "bg-green", bar: "bg-green-dim" },
};

// The tap gesture only becomes a drag past an 8px move so a tap still selects; touch waits
// 150ms so a scroll isn't hijacked — the same floor the prescription rows use.
const POINTER_ACTIVATION_DISTANCE = 8;
const TOUCH_ACTIVATION_DELAY_MS = 150;
const TOUCH_ACTIVATION_TOLERANCE = 8;

const dragId = (position: number): string => `strip-${position}`;
const dragPosition = (id: string): number => Number(id.slice("strip-".length));

// A render item within one section band: a solo exercise, or the contiguous run of one
// Superset's members. Positions index back into the draft, so a tap selects the right row.
type BandItem =
  | { kind: "solo"; position: number }
  | { kind: "group"; group: string; positions: number[]; roundRestSeconds: number | null };

function bandItems(positions: number[], layout: SupersetSlot[]): BandItem[] {
  const items: BandItem[] = [];
  let cursor = 0;
  while (cursor < positions.length) {
    const position = positions[cursor];
    const slot = layout[position];
    if (slot.group === null) {
      items.push({ kind: "solo", position });
      cursor += 1;
      continue;
    }
    const group = slot.group;
    const members: number[] = [];
    while (cursor < positions.length && layout[positions[cursor]].group === group) {
      members.push(positions[cursor]);
      cursor += 1;
    }
    items.push({
      kind: "group",
      group,
      positions: members,
      roundRestSeconds: layout[members[0]].roundRestSeconds,
    });
  }
  return items;
}

function summaryLine(exercise: StripExercise): string {
  const reps = exercise.reps?.trim?.() ?? String(exercise.reps ?? "");
  return reps ? `${exercise.sets} × ${reps}` : `${exercise.sets} sets`;
}

export function SessionCompositionStrip({
  exercises,
  layout,
  selectedPosition,
  onSelect,
  onReorder,
}: SessionCompositionStripProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: POINTER_ACTIVATION_DISTANCE },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_ACTIVATION_DELAY_MS,
        tolerance: TOUCH_ACTIVATION_TOLERANCE,
      },
    }),
  );

  if (exercises.length === 0) return null;
  const bands = sectionBands(exercises);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!onReorder || over === null || active.id === over.id) return;
    onReorder(dragPosition(String(active.id)), dragPosition(String(over.id)));
  }

  const body = (
    <div
      className="flex flex-col gap-4 rounded-md border border-border bg-base/40 p-3"
      aria-label="Workout composition"
    >
      <span className="label-mono text-[9px] text-text-muted">COMPOSITION</span>
      {bands.map((band, bandIndex) => {
        const meta = SECTION_META[band.section];
        return (
          <div key={`${band.section}-${bandIndex}`} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} aria-hidden />
              <span
                className={cn(
                  "label-mono shrink-0 text-[10px] font-semibold tracking-wider",
                  meta.text,
                )}
              >
                {meta.label}
              </span>
              <span className={cn("h-px flex-1", meta.bar)} />
              <span className="label-mono shrink-0 text-[9px] text-text-muted">
                {band.positions.length}
              </span>
            </div>

            <ul className="flex list-none flex-col gap-1.5 p-0">
              {bandItems(band.positions, layout).map((item) =>
                item.kind === "solo" ? (
                  <CompositionTile
                    key={`p-${item.position}`}
                    exercise={exercises[item.position]}
                    slot={layout[item.position]}
                    meta={meta}
                    position={item.position}
                    selected={item.position === selectedPosition}
                    draggable={onReorder !== undefined}
                    onSelect={() => onSelect(item.position)}
                  />
                ) : (
                  <SupersetBracket
                    key={`g-${item.group}-${item.positions[0]}`}
                    positions={item.positions}
                    exercises={exercises}
                    layout={layout}
                    meta={meta}
                    roundRestSeconds={item.roundRestSeconds}
                    selectedPosition={selectedPosition}
                    draggable={onReorder !== undefined}
                    onSelect={onSelect}
                  />
                ),
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );

  // Always mount the DnD context (even with no `onReorder`, e.g. a locked Session) so each
  // tile's `useSortable` has its required ancestor; the tiles are simply `disabled` when not
  // draggable, and `onDragEnd` no-ops without a reorder handler.
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={exercises.map((_, position) => dragId(position))}
        strategy={verticalListSortingStrategy}
      >
        {body}
      </SortableContext>
    </DndContext>
  );
}

interface CompositionTileProps {
  exercise: StripExercise;
  slot: SupersetSlot;
  meta: SectionMeta;
  position: number;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
}

// One labeled tile: the Exercise name, a compact summary, the A/B/C member badge in a
// Superset, and — when draggable — a grip handle (the only drag source, so a tap still
// selects). Selecting focuses the editable Prescription below.
function CompositionTile({
  exercise,
  slot,
  meta,
  position,
  selected,
  draggable,
  onSelect,
}: CompositionTileProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: dragId(position), disabled: !draggable });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn("flex items-center gap-1.5", isDragging && "opacity-40")}
    >
      {draggable ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${exercise.exerciseName} to reorder`}
          title="Drag to reorder"
          className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-text-muted transition-colors hover:text-text-primary active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-md border bg-surface px-3 py-2 text-left transition-colors",
          selected
            ? "border-cyan ring-2 ring-cyan/30"
            : "border-border hover:border-border-lite",
        )}
      >
        {slot.memberLabel ? (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-cyan/15 font-mono text-[10px] font-bold text-cyan"
            aria-label={`Superset member ${slot.memberLabel}`}
          >
            {slot.memberLabel}
          </span>
        ) : (
          <span className={cn("h-6 w-1 shrink-0 rounded-full", meta.dot)} aria-hidden />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-display text-[13px] font-semibold text-text-primary">
            {exercise.exerciseName}
          </span>
          <span className="label-mono text-[9px] text-text-muted">
            {summaryLine(exercise)}
          </span>
        </span>
      </button>
    </li>
  );
}

interface SupersetBracketProps {
  positions: number[];
  exercises: StripExercise[];
  layout: SupersetSlot[];
  meta: SectionMeta;
  roundRestSeconds: number | null;
  selectedPosition: number | null;
  draggable: boolean;
  onSelect: (position: number) => void;
}

// A Superset bracketed as a sub-card wrapping its member tiles, with the one shared round
// instruction at the foot — grouping reads before any field is opened (ADR-0023).
function SupersetBracket({
  positions,
  exercises,
  layout,
  meta,
  roundRestSeconds,
  selectedPosition,
  draggable,
  onSelect,
}: SupersetBracketProps) {
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-cyan/40 bg-cyan/5 p-2">
      <div className="flex items-center justify-between px-0.5">
        <span className="label-mono flex items-center gap-1 text-[9px] text-cyan">
          <Link2 className="h-3 w-3" aria-hidden />
          SUPERSET
        </span>
        <span className="label-mono text-[9px] text-text-muted">
          {positions.length} exercises · one round
        </span>
      </div>
      <ul className="flex list-none flex-col gap-1.5 p-0">
        {positions.map((position) => (
          <CompositionTile
            key={`p-${position}`}
            exercise={exercises[position]}
            slot={layout[position]}
            meta={meta}
            position={position}
            selected={position === selectedPosition}
            draggable={draggable}
            onSelect={() => onSelect(position)}
          />
        ))}
      </ul>
      <p className="label-mono px-0.5 text-[9px] text-cyan">
        ↻ Round rest {roundRestSeconds === null ? "—" : `${roundRestSeconds}s`} after each
        round
      </p>
    </li>
  );
}
