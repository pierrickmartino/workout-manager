"use client";

import { useDroppable } from "@dnd-kit/core";

import { GripVertical, Link2 } from "@/components/pulse/icons";
import { chipDropId } from "@/lib/protocol-builder";
import type { DraftPrescription, SupersetSlot } from "@/lib/protocol-builder";
import { cn } from "@/lib/utils";
import { SupersetBadge } from "@/components/builder/prescription-row-parts";

// The drag affordances of the Protocol Builder's Prescription list (#219/#220): the insertion
// line, the lifted clone, and a solo row's link chip. All three are decorative — keyboard and
// screen-reader users drive reorder and grouping through the button floor (#153), and the same
// microcopy reaches them through @dnd-kit's live-region announcements — so each is `aria-hidden`
// and adds no tab stop.

// The explicit reorder insertion line drawn in the gap between rows (#219): a solid accent bar,
// deliberately distinct from the filled group drop-zones (a bar, not a fill), so the two intents
// — reorder vs group — never read the same. Centered in the list's 12px row gap.
//
// When a `label` is present (#220) it anchors the foreshadow microcopy — "Move here" for a
// reorder, "Release to remove … from superset A" for a member leaving — as a pill riding the line
// at the drop slot, not under the pointer, so it stays readable during a touch drag.
export function InsertionLine({
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
        <span className="label-mono absolute left-0 -top-2 z-10 max-w-full truncate rounded-sm bg-cyan px-1.5 py-0.5 text-[9px] text-on-accent shadow-sm">
          {label}
        </span>
      ) : null}
    </span>
  );
}

// The floating clone shown in the DragOverlay while a row is lifted (#219): a compact, shadowed,
// slightly-scaled card naming the Exercise being moved. It is a visual echo of the row, not an
// editable copy — the real inputs stay in the dimmed source placeholder, so there is never a
// duplicate form control.
export function DragRowOverlay({
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

// A solo row's link-chip drop target: releasing another dragged Prescription onto it forms a new
// Superset from the two (`chip-<pos>` → `form-group`, #218). It is a 44px pointer/touch
// affordance surfaced only mid-drag; keyboard and screen-reader users form groups through the
// `Link2` button floor. Its id comes from `chipDropId` so the render layer and the classifier stay
// in lockstep.
export function SupersetLinkChip({
  position,
  active,
  foreshadow,
}: {
  position: number;
  active: boolean;
  foreshadow: string | null;
}) {
  // The chip registers as the form-group drop target; whether it fills solid is decided by the
  // shared `dragFeedback` classifier (`active`), so the escalation matches the drop. When live it
  // goes border-dashed → solid/filled — a fill, distinct from the reorder insertion line's bar
  // (#219).
  const { setNodeRef } = useDroppable({ id: chipDropId(position) });
  return (
    <div
      ref={setNodeRef}
      aria-hidden
      className={cn(
        "label-mono flex h-11 items-center justify-center gap-1.5 rounded-md border text-[10px] transition-colors touch-none",
        active
          ? "border-solid border-cyan bg-cyan-dim text-cyan ring-1 ring-cyan/50"
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
