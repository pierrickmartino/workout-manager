"use client";

import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Link2,
  Unlink,
  Trash2,
} from "lucide-react";
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

import { LOAD_KIND_OPTIONS, type LoadKind } from "@/lib/load";
import { classifyDrag, rowDropId } from "@/lib/protocol-builder";
import type {
  DraftPrescription,
  DropIntent,
  SupersetSlot,
} from "@/lib/protocol-builder";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

// The per-Prescription edit/reorder/group surface of the Protocol Builder's Session
// editor (ADR-0020/0023). Extracted from `ProtocolBuilder.tsx` so the drag-and-drop
// layer (Slice 5, #156) lives beside the rows it drives and the screen file stays
// cohesive. Drag is an *enhancement* over the keyboard/button controls from #153:
// those `aria`-labelled buttons remain the accessibility floor, so keyboard and
// screen-reader users keep full parity while pointer/touch users also get drag.

type PrescriptionField = "sets" | "reps" | "restSeconds" | "tempo";

// The drag id scheme is owned by `lib/protocol-builder` (`rowDropId` / `classifyDrag`,
// #217) so the render layer and the pure classifier never drift: each un-performed row
// is a sortable source (`row-<pos>`) whose grip handle is the *only* drag source, and a
// drop is classified into a semantic `DropIntent`. Positions are stable within one drag
// (the reducer dispatches only on drop), so the index doubles as the id. The container
// box + link chip drop targets (`box-`/`chip-`) arrive with drag-driven grouping in a
// later slice; today only row bodies exist, so drops resolve to reorder/leave.

// The pointer drag only starts after an 8px move so taps still reach the row's
// buttons; touch waits 150ms so a scroll gesture isn't hijacked into a drag.
const POINTER_ACTIVATION_DISTANCE = 8;
const TOUCH_ACTIVATION_DELAY_MS = 150;
const TOUCH_ACTIVATION_TOLERANCE = 8;

interface PrescriptionListProps {
  prescriptions: DraftPrescription[];
  layout: SupersetSlot[];
  // A performed Session is the frozen prefix (ADR-0020): its rows render read-only and
  // carry no edit/reorder/group affordances and no drag.
  locked: boolean;
  onEditField: (
    position: number,
    field: PrescriptionField,
    value: string | number | null,
  ) => void;
  onEditLoad: (position: number, loadKind: LoadKind, loadValue: string) => void;
  onEditRoundRest: (position: number, roundRestSeconds: number | null) => void;
  onReorder: (from: number, to: number) => void;
  onGroupWithNext: (position: number) => void;
  onUngroup: (position: number) => void;
  onRemove: (position: number) => void;
  // Drag gesture (#217): a drop is classified into a semantic `DropIntent` and applied
  // by the self-healing resolver. This slice only produces reorder/leave intents (row
  // bodies are the only drop targets); drag-driven grouping arrives with the container
  // box + link chip targets in a later slice.
  onResolveDrop: (intent: DropIntent) => void;
}

// The Session's Prescription rows. A performed Session renders a plain read-only list;
// an un-performed one wraps its rows in a DnD context so pointer/touch users can drag
// to reorder or superset, layered over the keyboard/button controls.
export function PrescriptionList({
  prescriptions,
  layout,
  locked,
  onEditField,
  onEditLoad,
  onEditRoundRest,
  onReorder,
  onGroupWithNext,
  onUngroup,
  onRemove,
  onResolveDrop,
}: PrescriptionListProps) {
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

  if (locked) {
    return (
      <ul className="flex flex-col gap-3 border-t border-border pt-3">
        {prescriptions.map((prescription, position) => (
          <li key={position}>
            <PrescriptionReadOnly
              prescription={prescription}
              slot={layout[position]}
            />
          </li>
        ))}
      </ul>
    );
  }

  const rowIds = prescriptions.map((_, position) => rowDropId(position));
  const lastPosition = prescriptions.length - 1;

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // The pure classifier decides what the drop means (or nothing, for a malformed id
    // or a drop onto self); the reducer's resolver then applies it (#217).
    const intent = classifyDrag(
      String(active.id),
      over ? String(over.id) : null,
      prescriptions,
    );
    if (intent) onResolveDrop(intent);
  }

  // Bracket the flat layout into render items: a solo Prescription renders as a bare
  // row, while a contiguous run of one Superset's members renders inside a single
  // visible container (#215). Contiguity is a reducer invariant (ADR-0023), so a run of
  // same-group slots is the whole group.
  const items = buildRenderItems(layout);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-3 border-t border-border pt-3">
          {items.map((item) =>
            item.kind === "solo" ? (
              <SortablePrescriptionRow
                key={`row-${item.position}`}
                position={item.position}
                prescription={prescriptions[item.position]}
                slot={layout[item.position]}
                canMoveUp={item.position > 0}
                canMoveDown={item.position < lastPosition}
                onEditField={onEditField}
                onEditLoad={onEditLoad}
                onReorder={onReorder}
                onGroupWithNext={onGroupWithNext}
                onUngroup={onUngroup}
                onRemove={onRemove}
              />
            ) : (
              <SupersetContainer
                key={`grp-${item.group}-${item.positions[0]}`}
                group={item.group}
                positions={item.positions}
                prescriptions={prescriptions}
                layout={layout}
                lastPosition={lastPosition}
                onEditField={onEditField}
                onEditLoad={onEditLoad}
                onEditRoundRest={onEditRoundRest}
                onReorder={onReorder}
                onGroupWithNext={onGroupWithNext}
                onUngroup={onUngroup}
                onRemove={onRemove}
              />
            ),
          )}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

// A render item is either a solo Prescription or the contiguous run of one Superset's
// members. `positions` are the run's indices into the Prescription/layout arrays.
type RenderItem =
  | { kind: "solo"; position: number }
  | { kind: "group"; group: string; positions: number[] };

// Walk the per-row layout into render items, collapsing each contiguous run of one
// group's members into a single `group` item so the render layer can wrap it in one
// container. Solo rows pass through as `solo` items. Relies on the reducer's contiguity
// invariant (ADR-0023): a group's members are always an unbroken run.
function buildRenderItems(layout: SupersetSlot[]): RenderItem[] {
  const items: RenderItem[] = [];
  let position = 0;
  while (position < layout.length) {
    const { group } = layout[position];
    if (group === null) {
      items.push({ kind: "solo", position });
      position += 1;
      continue;
    }
    const positions: number[] = [];
    while (position < layout.length && layout[position].group === group) {
      positions.push(position);
      position += 1;
    }
    items.push({ kind: "group", group, positions });
  }
  return items;
}

interface SupersetContainerProps {
  group: string;
  positions: number[];
  prescriptions: DraftPrescription[];
  layout: SupersetSlot[];
  lastPosition: number;
  onEditField: (
    position: number,
    field: PrescriptionField,
    value: string | number | null,
  ) => void;
  onEditLoad: (position: number, loadKind: LoadKind, loadValue: string) => void;
  onEditRoundRest: (position: number, roundRestSeconds: number | null) => void;
  onReorder: (from: number, to: number) => void;
  onGroupWithNext: (position: number) => void;
  onUngroup: (position: number) => void;
  onRemove: (position: number) => void;
}

// A Superset rendered as a visible bordered container wrapping its member rows (#215,
// Builder-only — Live and read-only views stay badge-only, ADR-0023). The A/B/C member
// badge stays inside each member row; the group's single round-rest field lives on the
// container (not on whichever member lands last), so rest belongs to the group. Each
// member keeps its own drag grip, move/link/unlink/remove controls — no drag behavior
// changes here; grouping/ungrouping still runs through those controls.
function SupersetContainer({
  group,
  positions,
  prescriptions,
  layout,
  lastPosition,
  onEditField,
  onEditLoad,
  onEditRoundRest,
  onReorder,
  onGroupWithNext,
  onUngroup,
  onRemove,
}: SupersetContainerProps) {
  const firstPosition = positions[0];
  const firstSlot = layout[firstPosition];
  return (
    <li>
      <div className="flex flex-col gap-3 rounded-lg border border-cyan/40 bg-cyan/5 p-2.5">
        <div className="flex items-center justify-between px-0.5">
          <span className="label-mono flex items-center gap-1.5 text-[9px] text-cyan">
            <Link2 className="h-3 w-3" aria-hidden />
            SUPERSET
          </span>
          <span className="label-mono text-[9px] text-text-muted">
            {firstSlot.groupSize} EXERCISES
          </span>
        </div>
        <ul className="flex flex-col gap-3">
          {positions.map((position) => (
            <SortablePrescriptionRow
              key={`row-${position}`}
              position={position}
              prescription={prescriptions[position]}
              slot={layout[position]}
              canMoveUp={position > 0}
              canMoveDown={position < lastPosition}
              onEditField={onEditField}
              onEditLoad={onEditLoad}
              onReorder={onReorder}
              onGroupWithNext={onGroupWithNext}
              onUngroup={onUngroup}
              onRemove={onRemove}
            />
          ))}
        </ul>

        {/* One group-owned round-rest field for the whole Superset — the round rests
            once at the boundary, after every member (ADR-0023). The edit applies to
            every member regardless of which position carries it. */}
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-cyan">Round rest (sec)</span>
          <Input
            type="number"
            min={0}
            value={firstSlot.roundRestSeconds ?? ""}
            aria-label={`Round rest for superset ${group}`}
            onChange={(e) =>
              onEditRoundRest(
                firstPosition,
                e.target.value === "" ? null : toIntOrZero(e.target.value),
              )
            }
          />
        </label>
      </div>
    </li>
  );
}

interface SortablePrescriptionRowProps {
  position: number;
  prescription: DraftPrescription;
  slot: SupersetSlot;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEditField: (
    position: number,
    field: PrescriptionField,
    value: string | number | null,
  ) => void;
  onEditLoad: (position: number, loadKind: LoadKind, loadValue: string) => void;
  onReorder: (from: number, to: number) => void;
  onGroupWithNext: (position: number) => void;
  onUngroup: (position: number) => void;
  onRemove: (position: number) => void;
}

// One draggable row. The grip handle is the *only* drag source — a 44px target in its
// own unused-space column (WCAG 2.5.5), so a fingertip that lands there drags and never
// edits a Prescription field (#216). The row itself is the reorder drop target. The
// group drop target no longer lives on the handle; it is relocated to the container box
// and a link chip in later slices, so the handle does one job: start a drag. The
// keyboard/button controls below remain the accessibility floor.
function SortablePrescriptionRow({
  position,
  prescription,
  slot,
  canMoveUp,
  canMoveDown,
  onEditField,
  onEditLoad,
  onReorder,
  onGroupWithNext,
  onUngroup,
  onRemove,
}: SortablePrescriptionRowProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rowDropId(position) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn("flex flex-col gap-2", isDragging && "opacity-60")}
    >
      <PrescriptionEditor
        prescription={prescription}
        slot={slot}
        onEditField={(field, value) => onEditField(position, field, value)}
        onEditLoad={(loadKind, loadValue) =>
          onEditLoad(position, loadKind, loadValue)
        }
      />
      <div className="flex items-center justify-between gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-hidden
          tabIndex={-1}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-dashed border-border text-text-muted transition-colors touch-none cursor-grab hover:text-text-primary active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="h-5 w-5" aria-hidden />
        </button>
        <PrescriptionControls
          name={prescription.exerciseName}
          slot={slot}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMoveUp={() => onReorder(position, position - 1)}
          onMoveDown={() => onReorder(position, position + 1)}
          onGroupWithNext={() => onGroupWithNext(position)}
          onUngroup={() => onUngroup(position)}
          onRemove={() => onRemove(position)}
        />
      </div>
    </li>
  );
}

interface PrescriptionControlsProps {
  name: string;
  slot: SupersetSlot;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onGroupWithNext: () => void;
  onUngroup: () => void;
  onRemove: () => void;
}

// Reorder (up/down), Superset group/ungroup, and remove controls for one Prescription
// in an un-performed Session. These `aria`-labelled buttons are the accessibility floor
// (#153): the keyboard/click path for reordering and grouping, unchanged by the drag
// enhancement layered on in Slice 5 (ADR-0023).
function PrescriptionControls({
  name,
  slot,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onGroupWithNext,
  onUngroup,
  onRemove,
}: PrescriptionControlsProps) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {slot.canGroupWithNext ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-cyan"
          aria-label={`Group ${name} with next into a superset`}
          onClick={onGroupWithNext}
        >
          <Link2 className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
      {slot.group !== null ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 text-cyan"
          aria-label={`Ungroup ${name} from its superset`}
          onClick={onUngroup}
        >
          <Unlink className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11"
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
        className="h-11 w-11"
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
        className="h-11 w-11 text-magenta"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}

// One read-only Prescription row for a performed (frozen) Session (ADR-0020).
export function PrescriptionReadOnly({
  prescription,
  slot,
}: {
  prescription: DraftPrescription;
  slot: SupersetSlot;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 truncate">
        {slot.memberLabel ? <SupersetBadge label={slot.memberLabel} /> : null}
        <span className="truncate font-sans text-[13px] text-text-secondary">
          {prescription.exerciseName}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[12px] text-text-muted">
        {prescription.sets} × {prescription.reps}
      </span>
    </div>
  );
}

// The A/B/C member badge for a Prescription inside a Superset (ADR-0023) — a compact,
// mono chip that communicates round-major membership without restructuring the row.
function SupersetBadge({ label }: { label: string }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-cyan/15 font-mono text-[10px] font-bold text-cyan"
      aria-label={`Superset member ${label}`}
    >
      {label}
    </span>
  );
}

interface PrescriptionEditorProps {
  prescription: DraftPrescription;
  slot: SupersetSlot;
  onEditField: (field: PrescriptionField, value: string | number | null) => void;
  onEditLoad: (loadKind: LoadKind, loadValue: string) => void;
}

function PrescriptionEditor({
  prescription,
  slot,
  onEditField,
  onEditLoad,
}: PrescriptionEditorProps) {
  const name = prescription.exerciseName;
  // While grouped, a member's own rest is dormant (ADR-0023): the group rests once per
  // round, so the per-member Rest input collapses and the single round-rest field shows
  // on the group's last member instead. Ungrouping brings the member's rest input back.
  const grouped = slot.group !== null;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
      <span className="flex items-center gap-2">
        {slot.memberLabel ? <SupersetBadge label={slot.memberLabel} /> : null}
        <span className="font-display text-[14px] font-semibold text-text-primary">
          {name}
        </span>
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
        {grouped ? null : (
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
        )}
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
