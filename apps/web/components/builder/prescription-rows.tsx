"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown, GripVertical, Link2 } from "@/components/pulse/icons";
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

import {
  shouldAutoExpandSuperset,
  supersetSummaryChips,
} from "@/lib/prescription-summary";
import type { WeightUnit } from "@/lib/weight-unit";
import {
  boxDropId,
  classifyDrag,
  dragFeedback,
  dragMicrocopy,
  rowDropId,
  supersetGroupLetter,
} from "@/lib/protocol-builder";
import type { DraftPrescription, SupersetSlot } from "@/lib/protocol-builder";
import { toIntOrZero } from "@/lib/numeric-input";
import type { PrescriptionEvent } from "@/lib/prescription-draft";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  PrescriptionControls,
  PrescriptionReadOnly,
} from "@/components/builder/prescription-row-parts";
import {
  DragRowOverlay,
  InsertionLine,
  SupersetLinkChip,
} from "@/components/builder/prescription-drag-chrome";
import { PrescriptionEditor } from "@/components/builder/prescription-editor";
import {
  PrescriptionDraftProvider,
  usePrescriptionDraft,
  type PrescriptionDraftContextValue,
} from "@/components/builder/prescription-draft-context";

// The per-Prescription edit/reorder/group surface of the Protocol Builder's Session
// editor (ADR-0020/0023). Extracted from `ProtocolBuilder.tsx` so the drag-and-drop
// layer (Slice 5, #156) lives beside the rows it drives and the screen file stays
// cohesive. Drag is an *enhancement* over the keyboard/button controls from #153:
// those `aria`-labelled buttons remain the accessibility floor, so keyboard and
// screen-reader users keep full parity while pointer/touch users also get drag.
//
// Every row below reads the open Session from `PrescriptionDraftContext` (ADR-0105) and
// raises one `PrescriptionEvent` per edit, so the two intermediaries on the way down — the
// Superset container and the sortable row — carry only what identifies them: a group, and a
// position.

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
  // The rows' one outward seam (ADR-0105): every edit, reorder, group and classified drop
  // they raise, addressed by position. The screen re-attaches the open Session's id and
  // hands it to the Builder reducer.
  dispatch: (event: PrescriptionEvent) => void;
}

// The Session's Prescription rows. A performed Session renders a plain read-only list;
// an un-performed one wraps its rows in a DnD context so pointer/touch users can drag
// to reorder or superset, layered over the keyboard/button controls.
//
// This is also the provider, and the two jobs are the same job: it owns the live drag gesture —
// the one piece of shared row state that is neither the draft nor an action — so it is where the
// gesture's handlers belong and where it enters the context as `meta`. Everything below reads it
// from there rather than being handed a per-row slice of it.
export function PrescriptionList({
  prescriptions,
  layout,
  locked,
  unit,
  dispatch,
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

  // The escalating feedback for the live drag (#219): a single classified descriptor the
  // rows read for the insertion line, the solid group drop-zones, and the losing-member
  // container. Null when nothing valid is under the pointer yet — which is always, for a
  // locked Session, since nothing in it can be lifted.
  const feedback =
    draggingId !== null ? dragFeedback(draggingId, overId, prescriptions) : null;
  // The foreshadowing microcopy for the live drag (#220): the target-anchored text a
  // pointer/touch user reads *before* release. Its `foreshadow` string is the single
  // source the visible label and the `onDragOver` announcement both render, so a sighted
  // and a screen-reader user get the same words (ADR-0027). Null when nothing valid is
  // under the pointer yet — the same no-ops the classifier rejects.
  const foreshadow =
    draggingId !== null
      ? (dragMicrocopy(draggingId, overId, prescriptions)?.foreshadow ?? null)
      : null;

  // Deliberately **not** memoized. Nothing in the row tree is behind a `React.memo`, so a
  // context consumer re-renders with this component whatever the value's identity is — and a
  // `useMemo` here would read as saving renders while saving none, which is the failure
  // ADR-0091 is about. (It would also be defeated anyway: `feedback` is a fresh descriptor on
  // every drag-over.) If a row is ever memoized, the stable value and the `useCallback` on the
  // dispatch it closes over land in that same change, per that ADR's pairing rule.
  const draft: PrescriptionDraftContextValue = {
    state: { prescriptions, layout, locked, unit },
    actions: { dispatch },
    meta: { draggingId, feedback, foreshadow },
  };

  const rowIds = prescriptions.map((_, position) => rowDropId(position));

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
    if (intent) dispatch({ type: "RESOLVE_DROP", intent });
  }

  function onDragCancel() {
    setDraggingId(null);
    setOverId(null);
  }

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
    <PrescriptionDraftProvider value={draft}>
      {locked ? (
        // A performed Session: settled record, so there is nothing to edit, reorder or drag
        // (ADR-0020) and no gesture layer around it.
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
      ) : (
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
                  />
                ) : (
                  <SupersetContainer
                    key={`grp-${item.group}-${item.positions[0]}`}
                    group={item.group}
                    positions={item.positions}
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
      )}
    </PrescriptionDraftProvider>
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
}: {
  group: string;
  positions: number[];
}) {
  const {
    state: { prescriptions, layout },
    actions: { dispatch },
    meta: { feedback, foreshadow },
  } = usePrescriptionDraft();
  const firstPosition = positions[0];
  const firstSlot = layout[firstPosition];
  // The group's user-facing letter (A = first Superset in the Session, #220) — the same
  // name the drag microcopy speaks, so the round-rest control and the drag announcements
  // refer to the group the same way instead of leaking its internal tag.
  const groupLetter = supersetGroupLetter(prescriptions, group);
  // This box's slice of the shared drag feedback (#219), so the visuals match the drop.
  // `joinActive`: a dragged row is over this box and will join it — light it as a solid
  // drop-zone. `losingMember`: one of this box's own members is being dragged out — show the
  // distinct "losing" state.
  const joinActive = feedback?.joinGroup === group;
  const losingMember = feedback?.losingGroup === group;
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
          // The box states are carried by its border and ring, never by an accent wash:
          // a wash composites under every label inside it, and the dim fills already sit
          // at the Contrast Floor with no headroom beneath them (ADR-0086).
          "flex flex-col gap-3 rounded-lg border p-2.5 transition-colors",
          joinActive
            ? "border-cyan ring-2 ring-cyan/60"
            : losingMember
              ? "border-dashed border-magenta/60 ring-1 ring-magenta/30"
              : "border-cyan/40",
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
            className="label-mono truncate rounded-sm bg-cyan px-1.5 py-1 text-[9px] text-on-accent"
          >
            {foreshadow}
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {positions.map((position) => (
            <SortablePrescriptionRow key={`row-${position}`} position={position} />
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
            className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")}
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
                dispatch({
                  type: "EDIT_ROUND_REST",
                  position: firstPosition,
                  roundRestSeconds:
                    e.target.value === "" ? null : toIntOrZero(e.target.value),
                })
              }
            />
          </label>
        </div>
      </div>
    </li>
  );
}

// One draggable row. The grip handle is the *only* drag source — a 44px target in its
// own unused-space column (WCAG 2.5.5), so a fingertip that lands there drags and never
// edits a Prescription field (#216). The row itself is the reorder drop target; a solo
// row also carries a link chip drop target that forms a new Superset when another row is
// released onto it (#218) — the group drop target lives there and on the container box,
// never on the handle, so the handle does one job: start a drag. The keyboard/button
// controls below remain the accessibility floor.
//
// `position` is its whole prop list (ADR-0105): the draft, the live gesture and the dispatch
// all come from the context, and the row derives its own slice of the feedback rather than
// being handed one computed two levels up.
function SortablePrescriptionRow({ position }: { position: number }) {
  const {
    state: { prescriptions, layout },
    actions: { dispatch },
    meta: { draggingId, feedback, foreshadow },
  } = usePrescriptionDraft();
  const prescription = prescriptions[position];
  const slot = layout[position];
  const lastPosition = prescriptions.length - 1;
  // Which edge carries the reorder insertion line (or null), and whether this solo's link chip
  // is the live form-group target (so it fills solid). A member row has no chip registered, so
  // `formGroupChip` can only ever name a solo.
  const insertionEdge = insertionEdgeFor(
    position,
    feedback?.insertionGap ?? null,
    lastPosition,
  );
  const chipActive = feedback?.formGroupChip === position;

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
      // A stable anchor so the composition strip (ADR-0074) can scroll a tapped tile's
      // editable Prescription into view — "select a tile → focus its prescription" (idea 5).
      id={`builder-prescription-${position}`}
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
      <PrescriptionEditor position={position} />
      {/* A solo row reveals its link chip (form-a-new-Superset drop target) while *another*
          row is being dragged (#218); a member row never does — it groups via the box. */}
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
          canMoveUp={position > 0}
          canMoveDown={position < lastPosition}
          onMoveUp={() =>
            dispatch({
              type: "REORDER_PRESCRIPTION",
              from: position,
              to: position - 1,
            })
          }
          onMoveDown={() =>
            dispatch({
              type: "REORDER_PRESCRIPTION",
              from: position,
              to: position + 1,
            })
          }
          onGroupWithNext={() => dispatch({ type: "GROUP_WITH_NEXT", position })}
          onUngroup={() => dispatch({ type: "UNGROUP", position })}
          onRemove={() => dispatch({ type: "REMOVE_PRESCRIPTION", position })}
        />
      </div>
    </li>
  );
}
