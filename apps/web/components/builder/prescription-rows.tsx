"use client";

import { useId, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripVertical,
  Link2,
  Unlink,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { type LoadKind } from "@/lib/load";
import {
  DEFAULT_SCHEME,
  compatibleSchemesForInput,
  currentScheme,
} from "@/lib/scheme-view";
import { schemePreviewForInput } from "@/lib/scheme-preview";
import {
  shouldAutoExpandSuperset,
  supersetSummaryChips,
} from "@/lib/prescription-summary";
import { planSetType } from "@/lib/set-type-view";
import { targetEffortFromInput } from "@/lib/target-effort-view";
import { DEFAULT_EFFORT_SCALE, type Effort } from "@/lib/effort";
import type { DistanceUnit, QuantityKind } from "@/lib/quantity";
import type { WeightUnit } from "@/lib/weight-unit";
import {
  boxDropId,
  chipDropId,
  classifyDrag,
  dragFeedback,
  dragMicrocopy,
  rowDropId,
  supersetGroupLetter,
} from "@/lib/protocol-builder";
import type {
  DraftPrescription,
  DragFeedback,
  DropIntent,
  SupersetSlot,
} from "@/lib/protocol-builder";
import { cn } from "@/lib/utils";
import { PrescriptionFieldStack } from "@/components/prescription/PrescriptionFieldStack";
import { Badge } from "@/components/ui/badge";
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

// The drag id scheme is owned by `lib/protocol-builder` (`rowDropId` / `chipDropId` /
// `boxDropId` / `classifyDrag`, #217) so the render layer and the pure classifier never
// drift: each un-performed row is a sortable source (`row-<pos>`) whose grip handle is
// the *only* drag source, and a drop is classified into a semantic `DropIntent`.
// Positions are stable within one drag (the reducer dispatches only on drop), so the
// index doubles as the id. Alongside the row bodies (reorder / leave-group) the two
// group drop targets are wired here (#218): a solo's link chip (`chip-<pos>`) forms a
// new Superset, and a container box (`box-<group>`) joins that Superset — both surfaced
// while a drag is in flight and resolved by the self-healing resolver on release.

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
  // The reader's Weight Unit (#417), forwarded to each row's Load picker.
  unit: WeightUnit;
  onEditField: (
    position: number,
    field: PrescriptionField,
    value: string | number | null,
  ) => void;
  onEditLoad: (position: number, loadKind: LoadKind, loadValue: string) => void;
  onSetScheme: (position: number, scheme: string | null) => void;
  onSetSetType: (position: number, setType: string | null) => void;
  onSetTargetEffort: (position: number, targetEffort: Effort | null) => void;
  onSetNote: (position: number, note: string | null) => void;
  // Pick the typed Quantity kind + unit on the Prescription at `position` (ADR-0050, #464).
  onSetQuantity: (
    position: number,
    quantityKind: QuantityKind,
    quantityUnit: DistanceUnit,
  ) => void;
  onEditRoundRest: (position: number, roundRestSeconds: number | null) => void;
  onReorder: (from: number, to: number) => void;
  onGroupWithNext: (position: number) => void;
  onUngroup: (position: number) => void;
  onRemove: (position: number) => void;
  // Drag gesture (#217/#218): a drop is classified into a semantic `DropIntent` and
  // applied by the self-healing resolver. All four intents are drag-reachable — row
  // bodies reorder or leave a group, a solo's link chip forms a new Superset, and a
  // container box joins one — so Superset membership is fully drag-manipulable.
  onResolveDrop: (intent: DropIntent) => void;
}

// The Session's Prescription rows. A performed Session renders a plain read-only list;
// an un-performed one wraps its rows in a DnD context so pointer/touch users can drag
// to reorder or superset, layered over the keyboard/button controls.
export function PrescriptionList({
  prescriptions,
  layout,
  locked,
  unit,
  onEditField,
  onEditLoad,
  onSetScheme,
  onSetSetType,
  onSetTargetEffort,
  onSetNote,
  onSetQuantity,
  onEditRoundRest,
  onReorder,
  onGroupWithNext,
  onUngroup,
  onRemove,
  onResolveDrop,
}: PrescriptionListProps) {
  // The row currently being dragged (`row-<pos>` id), or null when idle. The group drop
  // targets (link chips, container join hint) surface only while a drag is in flight
  // (#218) — escalating feedback that keeps the resting list uncluttered.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // The drop target currently hovered (`row-`/`chip-`/`box-` id), or null. Together with
  // `draggingId` it feeds the pure `dragFeedback` view-model (#219), which decides the
  // escalating per-state visuals — insertion line, solid drop-zone, losing-member — off
  // the same classifier the resolver uses, so the feedback can never promise an outcome
  // the drop won't deliver.
  const [overId, setOverId] = useState<string | null>(null);

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

  function onDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
    setOverId(null);
  }

  function onDragOver(event: DragOverEvent) {
    // Track the live hover so `dragFeedback` can escalate the visuals as the pointer
    // moves; the drop itself is still classified afresh on release.
    setOverId(event.over ? String(event.over.id) : null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    setOverId(null);
    const { active, over } = event;
    // The pure classifier decides what the drop means (or nothing, for a malformed id
    // or a drop onto self); the reducer's resolver then applies it (#217/#218). The
    // over id's prefix names the intent: a row body reorders/leaves, a link chip forms
    // a new Superset, a container box joins one.
    const intent = classifyDrag(
      String(active.id),
      over ? String(over.id) : null,
      prescriptions,
    );
    if (intent) onResolveDrop(intent);
  }

  function onDragCancel() {
    setDraggingId(null);
    setOverId(null);
  }

  // The escalating feedback for the live drag (#219): a single classified descriptor the
  // render layer reads for the insertion line, the solid group drop-zones, and the
  // losing-member container. Null when nothing valid is under the pointer yet.
  const feedback =
    draggingId !== null ? dragFeedback(draggingId, overId, prescriptions) : null;
  // The foreshadowing microcopy for the live drag (#220): the target-anchored text a
  // pointer/touch user reads *before* release. Its `foreshadow` string is the single
  // source the visible label and the `onDragOver` announcement both render, so a sighted
  // and a screen-reader user get the same words (ADR-0027). Null when nothing valid is
  // under the pointer yet — the same no-ops the classifier rejects.
  const microcopy =
    draggingId !== null ? dragMicrocopy(draggingId, overId, prescriptions) : null;
  const foreshadow = microcopy?.foreshadow ?? null;
  // The position of the lifted row (its id is `row-<pos>`), or -1 when idle — the source
  // that dims into a placeholder gap and whose clone rides in the DragOverlay.
  const draggingPosition = draggingId !== null ? rowIds.indexOf(draggingId) : -1;

  // Mirror the visible foreshadow into @dnd-kit's live-region announcements so a
  // screen-reader user mid-drag hears the same outcome the sighted user sees, and the
  // committed result on drop (ADR-0027). `onDragOver` speaks the foreshadow; `onDragEnd`
  // speaks the settled `commit` — both from the one `dragMicrocopy` source, so the two
  // renderings can never disagree. The button floor stays the keyboard/SR parity path;
  // these announcements narrate the *drag* enhancement only.
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const position = rowIds.indexOf(String(active.id));
      return position >= 0
        ? `Picked up ${prescriptions[position].exerciseName}.`
        : undefined;
    },
    onDragOver: ({ active, over }) =>
      dragMicrocopy(
        String(active.id),
        over ? String(over.id) : null,
        prescriptions,
      )?.foreshadow,
    onDragEnd: ({ active, over }) =>
      dragMicrocopy(
        String(active.id),
        over ? String(over.id) : null,
        prescriptions,
      )?.commit,
    onDragCancel: () => "Movement cancelled.",
  };

  // Bracket the flat layout into render items: a solo Prescription renders as a bare
  // row, while a contiguous run of one Superset's members renders inside a single
  // visible container (#215). Contiguity is a reducer invariant (ADR-0023), so a run of
  // same-group slots is the whole group.
  const items = buildRenderItems(layout);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
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
                unit={unit}
                canMoveUp={item.position > 0}
                canMoveDown={item.position < lastPosition}
                draggingId={draggingId}
                insertionEdge={insertionEdgeFor(
                  item.position,
                  feedback?.insertionGap ?? null,
                  lastPosition,
                )}
                chipActive={feedback?.formGroupChip === item.position}
                foreshadow={foreshadow}
                onEditField={onEditField}
                onEditLoad={onEditLoad}
                onSetScheme={onSetScheme}
                onSetSetType={onSetSetType}
                onSetTargetEffort={onSetTargetEffort}
                onSetNote={onSetNote}
                onSetQuantity={onSetQuantity}
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
                unit={unit}
                lastPosition={lastPosition}
                joinActive={feedback?.joinGroup === item.group}
                losingMember={feedback?.losingGroup === item.group}
                insertionGap={feedback?.insertionGap ?? null}
                foreshadow={foreshadow}
                onEditField={onEditField}
                onEditLoad={onEditLoad}
                onSetScheme={onSetScheme}
                onSetSetType={onSetSetType}
                onSetTargetEffort={onSetTargetEffort}
                onSetNote={onSetNote}
                onSetQuantity={onSetQuantity}
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

      {/* The lifted clone rides above the list, unclipped by its overflow, so it stays
          visible even as the list scrolls during a drag (#219). It is the visual anchor
          the microcopy layer attaches to next. `aria-hidden` — keyboard/SR users drive
          reorder/group through the button floor, not the overlay. */}
      <DragOverlay dropAnimation={null}>
        {draggingPosition >= 0 ? (
          <DragRowOverlay
            prescription={prescriptions[draggingPosition]}
            slot={layout[draggingPosition]}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Which edge of the row at `position` carries the reorder insertion line, given the
// feedback's boundary `gap` (an index in `[0, length]`). A gap at `position` draws the
// line above that row; the final boundary (`length`) draws below the last row. Any other
// gap belongs to a different row. Null when there is no active reorder.
function insertionEdgeFor(
  position: number,
  gap: number | null,
  lastPosition: number,
): "top" | "bottom" | null {
  if (gap === null) return null;
  if (gap === position) return "top";
  if (position === lastPosition && gap === position + 1) return "bottom";
  return null;
}

// The explicit reorder insertion line drawn in the gap between rows (#219): a solid
// accent bar, deliberately distinct from the filled group drop-zones (a bar, not a fill),
// so the two intents — reorder vs group — never read the same. Centered in the list's
// 12px row gap. Decorative only.
//
// When a `label` is present (#220) it anchors the foreshadow microcopy — "Move here" for a
// reorder, "Release to remove … from superset A" for a member leaving — as a pill riding
// the line at the drop slot, not under the pointer, so it stays readable during a touch
// drag. The pill is `aria-hidden`; the same words reach a screen reader via `announcements`.
function InsertionLine({
  edge,
  label,
}: {
  edge: "top" | "bottom";
  label?: string | null;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-cyan shadow-[0_0_6px_rgba(34,211,238,0.7)]",
        edge === "top" ? "-top-[7px]" : "-bottom-[7px]",
      )}
    >
      {label ? (
        <span className="label-mono absolute left-0 -top-2 z-10 max-w-full truncate rounded-sm bg-cyan px-1.5 py-0.5 text-[9px] text-bg-primary shadow-sm">
          {label}
        </span>
      ) : null}
    </span>
  );
}

// The floating clone shown in the DragOverlay while a row is lifted (#219): a compact,
// shadowed, slightly-scaled card naming the Exercise being moved. It is a visual echo of
// the row, not an editable copy — the real inputs stay in the dimmed source placeholder,
// so there is never a duplicate form control. Decorative; the drag is announced through
// the source row's controls.
function DragRowOverlay({
  prescription,
  slot,
}: {
  prescription: DraftPrescription;
  slot: SupersetSlot;
}) {
  return (
    <div
      aria-hidden
      className="flex scale-[1.02] items-center gap-2 rounded-md border border-cyan/60 bg-surface px-3 py-2.5 shadow-lg shadow-black/30 ring-1 ring-cyan/30"
    >
      <GripVertical className="h-5 w-5 shrink-0 text-cyan" aria-hidden />
      {slot.memberLabel ? <SupersetBadge label={slot.memberLabel} /> : null}
      <span className="truncate font-display text-[14px] font-semibold text-text-primary">
        {prescription.exerciseName}
      </span>
      <span className="ml-auto shrink-0 font-mono text-[12px] text-text-muted">
        {prescription.sets} × {prescription.reps}
      </span>
    </div>
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
  unit: WeightUnit;
  lastPosition: number;
  // Escalating drag feedback for this container (#219), all derived from the one
  // `dragFeedback` classifier so the visuals match the drop. `joinActive`: a dragged row
  // is over this box and will join it — light it as a solid drop-zone. `losingMember`: one
  // of this box's own members is being dragged out — show the distinct "losing" state.
  // `insertionGap` positions the reorder line for a member moved within the box.
  joinActive: boolean;
  losingMember: boolean;
  insertionGap: number | null;
  // The live foreshadow microcopy for the whole drag (#220), or null when idle. Shown as
  // the box's join banner when a row is over it, and threaded to member rows for a
  // within-group reorder's insertion-line label.
  foreshadow: string | null;
  onEditField: (
    position: number,
    field: PrescriptionField,
    value: string | number | null,
  ) => void;
  onEditLoad: (position: number, loadKind: LoadKind, loadValue: string) => void;
  onSetScheme: (position: number, scheme: string | null) => void;
  onSetSetType: (position: number, setType: string | null) => void;
  onSetTargetEffort: (position: number, targetEffort: Effort | null) => void;
  onSetNote: (position: number, note: string | null) => void;
  onSetQuantity: (
    position: number,
    quantityKind: QuantityKind,
    quantityUnit: DistanceUnit,
  ) => void;
  onEditRoundRest: (position: number, roundRestSeconds: number | null) => void;
  onReorder: (from: number, to: number) => void;
  onGroupWithNext: (position: number) => void;
  onUngroup: (position: number) => void;
  onRemove: (position: number) => void;
}

// A Superset rendered as a visible bordered container wrapping its member rows (#215,
// Builder-only — Live and read-only views stay badge-only, ADR-0023). The A/B/C member
// badge stays inside each member row; the group's single round-rest field lives on the
// container (not on whichever member lands last), so rest belongs to the group.
//
// The container mirrors the members' progressive disclosure (#469): the group round-rest lives
// inside its own **More** drawer, and when the drawer is collapsed a `round rest 90s` chip stands
// in for it (the container twin of a member's Prescription Summary — never a member's `90s rest`).
// The drawer auto-expands when a round-rest is set so the field is visible on first view, and its
// open/closed state is ephemeral (per-render React state), exactly like the field stack's. The
// disclosure is a standard button/region pair so keyboard and screen-reader users operate and hear
// it, matching the Builder's accessibility floor (ADR-0027).
//
// The container box is itself the group's join drop target (`box-<group>`, #218):
// releasing a dragged Prescription inside the box adds it to this Superset via the
// self-healing resolver. The box lights up while it is the live drop target — except
// when one of its own members is the thing being dragged (dropping a co-member back on
// its own box is a resolver no-op, so promising a join there would mislead). The
// `Link2`/`Unlink` and move buttons remain the keyboard/SR floor, untouched.
function SupersetContainer({
  group,
  positions,
  prescriptions,
  layout,
  unit,
  lastPosition,
  joinActive,
  losingMember,
  insertionGap,
  foreshadow,
  onEditField,
  onEditLoad,
  onSetScheme,
  onSetSetType,
  onSetTargetEffort,
  onSetNote,
  onSetQuantity,
  onEditRoundRest,
  onReorder,
  onGroupWithNext,
  onUngroup,
  onRemove,
}: SupersetContainerProps) {
  const firstPosition = positions[0];
  const firstSlot = layout[firstPosition];
  // The group's user-facing letter (A = first Superset in the Session, #220) — the same
  // name the drag microcopy speaks, so the round-rest control and the drag announcements
  // refer to the group the same way instead of leaking its internal tag.
  const groupLetter = supersetGroupLetter(prescriptions, group);
  // The container's ephemeral More/Less state (#469), the exact species as the field stack's:
  // seeded once so a group with a round-rest opens expanded (nothing meaningful hidden on first
  // view) and an empty one opens collapsed, then freely toggled. It never persists — a fresh
  // render re-seeds off the current round-rest. When collapsed, the round-rest chip stands in for
  // the hidden field.
  const roundRestSeconds = firstSlot.roundRestSeconds;
  const summaryChips = supersetSummaryChips({ roundRestSeconds });
  const [open, setOpen] = useState<boolean>(() =>
    shouldAutoExpandSuperset({ roundRestSeconds }),
  );
  const contentId = useId();
  // The box registers as the group's join drop target; whether it *lights* is decided by
  // the shared feedback classifier (`joinActive`), not the raw hover — so a co-member
  // dropped back on its own box (a resolver no-op) never promises a join (#218/#219).
  const { setNodeRef } = useDroppable({ id: boxDropId(group) });
  return (
    <li>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-3 rounded-lg border p-2.5 transition-colors",
          joinActive
            ? "border-cyan bg-cyan/20 ring-2 ring-cyan/60"
            : losingMember
              ? "border-dashed border-magenta/60 bg-magenta/5 ring-1 ring-magenta/30"
              : "border-cyan/40 bg-cyan/5",
        )}
      >
        <div className="flex items-center justify-between px-0.5">
          <span className="label-mono flex items-center gap-1.5 text-[9px] text-cyan">
            <Link2 className="h-3 w-3" aria-hidden />
            SUPERSET
          </span>
          <span className="label-mono text-[9px] text-text-muted">
            {firstSlot.groupSize} EXERCISES
          </span>
        </div>
        {/* The join foreshadow, anchored inside the box (the join drop target) rather than
            under the pointer, so it stays readable during a touch drag (#220). Shown only
            while a row is over the box; the same words reach a screen reader via
            `announcements`, so this pill is `aria-hidden`. */}
        {joinActive && foreshadow ? (
          <p
            aria-hidden
            className="label-mono truncate rounded-sm bg-cyan px-1.5 py-1 text-[9px] text-bg-primary"
          >
            {foreshadow}
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {positions.map((position) => (
            <SortablePrescriptionRow
              key={`row-${position}`}
              position={position}
              prescription={prescriptions[position]}
              slot={layout[position]}
              unit={unit}
              canMoveUp={position > 0}
              canMoveDown={position < lastPosition}
              // A member row never shows a link chip (it groups via the box, #218); an
              // insertion line does appear for a within-group reorder.
              chipActive={false}
              insertionEdge={insertionEdgeFor(position, insertionGap, lastPosition)}
              foreshadow={foreshadow}
              onEditField={onEditField}
              onEditLoad={onEditLoad}
              onSetScheme={onSetScheme}
              onSetSetType={onSetSetType}
              onSetTargetEffort={onSetTargetEffort}
              onSetNote={onSetNote}
              onSetQuantity={onSetQuantity}
              onReorder={onReorder}
              onGroupWithNext={onGroupWithNext}
              onUngroup={onUngroup}
              onRemove={onRemove}
            />
          ))}
        </ul>

        {/* The container's Prescription Summary (#469): a `round rest 90s` chip standing in for
            the round-rest field while the More drawer is collapsed, so the group's boundary rest
            reads at a glance without opening the drawer. A group with no round-rest set shows
            nothing here. */}
        {!open && summaryChips.length > 0 ? (
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label={`Superset ${groupLetter} summary`}
          >
            {summaryChips.map((chip) => (
              <li key={chip.key}>
                <Badge variant="outline" aria-label={chip.ariaLabel}>
                  {chip.label}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {/* The More disclosure — a button/region pair (aria-expanded + aria-controls) so
            keyboard and screen-reader users operate and hear it (ADR-0027), mirroring the
            members'. The accessible name leads with the visible "More"/"Less" word (WCAG 2.5.3)
            and names the superset so one group's control is distinguishable from the next. */}
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={`${open ? "Less" : "More"} — round rest for superset ${groupLetter}`}
          className="label-mono flex items-center gap-1 self-start rounded-sm text-[10px] text-cyan transition-colors hover:text-text-primary"
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
            aria-hidden
          />
          {open ? "Less" : "More"}
        </button>

        {/* One group-owned round-rest field for the whole Superset — the round rests
            once at the boundary, after every member (ADR-0023). Held inside the More drawer
            (#469); the edit applies to every member regardless of which position carries it. */}
        <div id={contentId} hidden={!open}>
          <label className="flex flex-col gap-1.5">
            <span className="label-mono text-[9px] text-cyan">Round rest (sec)</span>
            <Input
              type="number"
              min={0}
              value={roundRestSeconds ?? ""}
              aria-label={`Round rest for superset ${groupLetter}`}
              onChange={(e) =>
                onEditRoundRest(
                  firstPosition,
                  e.target.value === "" ? null : toIntOrZero(e.target.value),
                )
              }
            />
          </label>
        </div>
      </div>
    </li>
  );
}

interface SortablePrescriptionRowProps {
  position: number;
  prescription: DraftPrescription;
  slot: SupersetSlot;
  unit: WeightUnit;
  canMoveUp: boolean;
  canMoveDown: boolean;
  // The row currently being dragged (`row-<pos>`), or null/absent when idle. A solo row
  // reveals its link chip (form-a-new-Superset drop target) while *another* row is being
  // dragged (#218); member rows inside a container never show it (they join via the box).
  draggingId?: string | null;
  // Escalating feedback for this row (#219): which edge carries the reorder insertion
  // line (or null), and whether this solo's link chip is the live form-group target (so
  // it fills solid). Both come from the shared `dragFeedback` classifier.
  insertionEdge: "top" | "bottom" | null;
  chipActive: boolean;
  // The live foreshadow microcopy for the whole drag (#220), or null when idle. A row
  // renders it only where it is the active drop target — on its insertion line when it is
  // the reorder/leave slot, or on its link chip when it is the form-group target — so the
  // single active string never double-shows.
  foreshadow: string | null;
  onEditField: (
    position: number,
    field: PrescriptionField,
    value: string | number | null,
  ) => void;
  onEditLoad: (position: number, loadKind: LoadKind, loadValue: string) => void;
  onSetScheme: (position: number, scheme: string | null) => void;
  onSetSetType: (position: number, setType: string | null) => void;
  onSetTargetEffort: (position: number, targetEffort: Effort | null) => void;
  onSetNote: (position: number, note: string | null) => void;
  onSetQuantity: (
    position: number,
    quantityKind: QuantityKind,
    quantityUnit: DistanceUnit,
  ) => void;
  onReorder: (from: number, to: number) => void;
  onGroupWithNext: (position: number) => void;
  onUngroup: (position: number) => void;
  onRemove: (position: number) => void;
}

// One draggable row. The grip handle is the *only* drag source — a 44px target in its
// own unused-space column (WCAG 2.5.5), so a fingertip that lands there drags and never
// edits a Prescription field (#216). The row itself is the reorder drop target; a solo
// row also carries a link chip drop target that forms a new Superset when another row is
// released onto it (#218) — the group drop target lives there and on the container box,
// never on the handle, so the handle does one job: start a drag. The keyboard/button
// controls below remain the accessibility floor.
function SortablePrescriptionRow({
  position,
  prescription,
  slot,
  unit,
  canMoveUp,
  canMoveDown,
  draggingId,
  insertionEdge,
  chipActive,
  foreshadow,
  onEditField,
  onEditLoad,
  onSetScheme,
  onSetSetType,
  onSetTargetEffort,
  onSetNote,
  onSetQuantity,
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
      // While lifted, the source dims into a dashed placeholder gap — the row's clone
      // rides in the DragOverlay instead (#219). `relative` anchors the insertion line.
      className={cn(
        "relative flex flex-col gap-2",
        isDragging && "rounded-md opacity-40 outline-dashed outline-1 outline-border",
      )}
    >
      {insertionEdge ? (
        <InsertionLine edge={insertionEdge} label={foreshadow} />
      ) : null}
      <PrescriptionEditor
        prescription={prescription}
        slot={slot}
        unit={unit}
        onEditField={(field, value) => onEditField(position, field, value)}
        onEditLoad={(loadKind, loadValue) =>
          onEditLoad(position, loadKind, loadValue)
        }
        onSetScheme={(scheme) => onSetScheme(position, scheme)}
        onSetSetType={(setType) => onSetSetType(position, setType)}
        onSetTargetEffort={(targetEffort) =>
          onSetTargetEffort(position, targetEffort)
        }
        onSetNote={(note) => onSetNote(position, note)}
        onSetQuantity={(kind, quantityUnit) =>
          onSetQuantity(position, kind, quantityUnit)
        }
      />
      {slot.group === null &&
      draggingId != null &&
      draggingId !== rowDropId(position) ? (
        <SupersetLinkChip
          position={position}
          active={chipActive}
          foreshadow={foreshadow}
        />
      ) : null}
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

// A solo row's link-chip drop target: releasing another dragged Prescription onto it
// forms a new Superset from the two (`chip-<pos>` → `form-group`, #218). It is a 44px
// pointer/touch affordance surfaced only mid-drag; keyboard and screen-reader users form
// groups through the `Link2` button floor, so the chip is `aria-hidden` (it adds no new
// tab stop). Its id comes from `chipDropId` so the render layer and classifier stay in
// lockstep.
function SupersetLinkChip({
  position,
  active,
  foreshadow,
}: {
  position: number;
  active: boolean;
  foreshadow: string | null;
}) {
  // The chip registers as the form-group drop target; whether it fills solid is decided
  // by the shared `dragFeedback` classifier (`active`), so the escalation matches the
  // drop. When live it goes border-dashed → solid/filled — a fill, distinct from the
  // reorder insertion line's bar (#219).
  const { setNodeRef } = useDroppable({ id: chipDropId(position) });
  return (
    <div
      ref={setNodeRef}
      aria-hidden
      className={cn(
        "label-mono flex h-11 items-center justify-center gap-1.5 rounded-md border text-[10px] transition-colors touch-none",
        active
          ? "border-solid border-cyan bg-cyan/20 text-cyan ring-1 ring-cyan/50"
          : "border-dashed border-border/70 text-text-muted",
      )}
    >
      <Link2 className="h-4 w-4" aria-hidden />
      {/* Live target: the foreshadow names the exercise the new Superset starts with
          ("Release to start a superset with …", #220), one source with the announcement. */}
      <span className="truncate">
        {active
          ? (foreshadow ?? "Release to start a superset")
          : "Drop here to start a superset"}
      </span>
    </div>
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
  // The reader's Weight Unit (#417): the Load picker names it and the value is authored in it.
  unit: WeightUnit;
  onEditField: (field: PrescriptionField, value: string | number | null) => void;
  onEditLoad: (loadKind: LoadKind, loadValue: string) => void;
  onSetScheme: (scheme: string | null) => void;
  onSetSetType: (setType: string | null) => void;
  onSetTargetEffort: (targetEffort: Effort | null) => void;
  onSetNote: (note: string | null) => void;
  onSetQuantity: (quantityKind: QuantityKind, quantityUnit: DistanceUnit) => void;
}

function PrescriptionEditor({
  prescription,
  slot,
  unit,
  onEditField,
  onEditLoad,
  onSetScheme,
  onSetSetType,
  onSetTargetEffort,
  onSetNote,
  onSetQuantity,
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

      {/* The authored plan — the one shared, presentation-only field stack every authoring
          surface now renders (ADR-0067, #464). Extracting it hands the Builder card the typed
          Quantity kind selector the ad-hoc surfaces already carried, so a duration/distance is
          authored honestly rather than forced into a rep string. The Progression Scheme (the
          Builder's own advanced field) rides in the `advanced` slot. */}
      <PrescriptionFieldStack
        exerciseName={name}
        weightUnit={unit}
        kind={prescription.quantityKind}
        unit={prescription.quantityUnit}
        sets={String(prescription.sets)}
        target={prescription.reps}
        restSeconds={
          prescription.restSeconds === null ? "" : String(prescription.restSeconds)
        }
        tempo={prescription.tempo ?? ""}
        setType={prescription.setType ?? ""}
        // Target Effort (ADR-0066, #467): the draft holds the typed value, so project it back to
        // the editor's scale pick + display value; an unset target defaults the scale and leaves
        // the value blank. The onChange parses the pair back to the typed value (or null).
        targetEffortScale={prescription.targetEffort?.scale ?? DEFAULT_EFFORT_SCALE}
        targetEffortValue={
          prescription.targetEffort ? String(prescription.targetEffort.value) : ""
        }
        // Exercise Note (ADR-0065, #468): the draft holds the decoded cue (see
        // `initBuilderDraft`), so it renders directly; a null note is an empty field.
        note={prescription.note ?? ""}
        loadKind={prescription.loadKind}
        loadValue={prescription.loadValue}
        showRest={!grouped}
        // Picking a Quantity kind fixes what the target means; unlike the ad-hoc surfaces the
        // Builder does not re-default the Load, so a generated Load the user is editing is
        // never silently discarded.
        onChangeKind={(kind) => onSetQuantity(kind, prescription.quantityUnit)}
        onChangeUnit={(quantityUnit) =>
          onSetQuantity(prescription.quantityKind, quantityUnit)
        }
        onChangeSets={(value) => onEditField("sets", toIntOrZero(value))}
        onChangeTarget={(value) => onEditField("reps", value)}
        onChangeRest={(value) =>
          onEditField("restSeconds", value === "" ? null : toIntOrZero(value))
        }
        onChangeTempo={(value) =>
          onEditField("tempo", value === "" ? null : value)
        }
        // The working default is stored as unset (null) so a plain set carries no annotation;
        // any non-working member is stored as-is and rides through DEPLOY (#463/#466).
        onChangeSetType={(value) => onSetSetType(planSetType(value))}
        // A blank value clears the target (null); any value rides onto the picked scale and
        // through DEPLOY untouched (#463). Descriptive only — it feeds no progression (ADR-0066).
        onChangeTargetEffort={(scale, value) =>
          onSetTargetEffort(targetEffortFromInput(scale, value))
        }
        // A blank value clears the note (null); any text rides through DEPLOY, where the write
        // boundary length-caps + HTML-escapes it (ADR-0065, #468). Descriptive only.
        onChangeNote={(value) =>
          onSetNote(value.trim() === "" ? null : value)
        }
        onChangeLoadKind={(value) =>
          onEditLoad(value as LoadKind, prescription.loadValue)
        }
        onChangeLoadValue={(value) => onEditLoad(prescription.loadKind, value)}
        advanced={
          /* Progression Scheme (ADR-0064, #432): how this movement's un-performed tail steps.
             The selector lives inside **More** (#465). Only schemes compatible with the current
             Load are offered — Greyskull disappears the moment the Load has no clean kilogram
             axis — so an incompatible choice can't be staged. Selecting the default clears the
             stored selection (null ⇒ default). */
          <label className="flex flex-col gap-1.5">
            <span className="label-mono text-[9px] text-text-muted">
              Progression scheme
            </span>
            <Select
              value={currentScheme(prescription)}
              aria-label={`Progression scheme for ${name}`}
              onChange={(e) =>
                onSetScheme(e.target.value === DEFAULT_SCHEME ? null : e.target.value)
              }
            >
              {compatibleSchemesForInput(
                prescription.loadKind,
                prescription.loadValue,
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        }
        preview={
          /* Scheme Preview (ADR-0064/0065, #452): a plain-language sentence describing what the
             chosen scheme will do next, from this movement's live reps + Load. It stands in for
             the scheme on its own line whether More is open or closed (never a summary chip,
             #465), and recomputes as the scheme, reps, or Load fields change — a read-time
             projection that stores nothing. */
          <span
            aria-live="polite"
            className="font-mono text-[11px] leading-snug text-text-muted"
          >
            {schemePreviewForInput(
              currentScheme(prescription),
              prescription.reps,
              prescription.loadKind,
              prescription.loadValue,
            )}
          </span>
        }
      />
    </div>
  );
}

// Parse a numeric input to a non-negative integer, treating blanks/garbage as 0 so
// the draft field stays a number for the reducer.
function toIntOrZero(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
