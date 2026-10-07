"use client";

import { createContext, use, type ReactNode } from "react";

import type {
  DraftPrescription,
  DragFeedback,
  SupersetSlot,
} from "@/lib/protocol-builder";
import type { PrescriptionEvent } from "@/lib/prescription-draft";
import type { WeightUnit } from "@/lib/weight-unit";

// The one contract the Protocol Builder's Prescription rows read the open Session through
// (ADR-0105). Shaped as `state` / `actions` / `meta` so it is a contract any provider can
// implement, not a private channel between two files: the rows render against the interface,
// and what holds the draft behind it — today a `useReducer` in `ProtocolBuilder` — is the
// provider's business.
//
// Before this, the same 13 callbacks were re-declared at four levels and threaded through
// `PrescriptionList → SupersetContainer → SortablePrescriptionRow → PrescriptionEditor`,
// so the two intermediaries declared, destructured and forwarded a block of props neither of
// them used. Now a row reads what it needs where it needs it, and the intermediaries carry
// only what they are: a group, and a position.

// What the rows render: the open Session's draft, exactly as the screen holds it. A `position`
// indexes both arrays — the row's whole identity is that index, which is why nothing below
// needs to be handed its own copy of the Prescription.
export interface PrescriptionDraftState {
  prescriptions: DraftPrescription[];
  layout: SupersetSlot[];
  // A performed Session is the frozen prefix (ADR-0020): its rows render read-only and carry
  // no edit/reorder/group affordances and no drag.
  locked: boolean;
  // The reader's Weight Unit (#417), which each row's Load picker names and authors in.
  unit: WeightUnit;
}

// The rows' one outward verb. Every edit, reorder, group and drop a row raises is a
// `PrescriptionEvent` addressed by position — never a per-concern callback, so a new reducer
// event reaches the rows without a new prop at four levels.
export interface PrescriptionDraftActions {
  dispatch: (event: PrescriptionEvent) => void;
}

// The live drag gesture: not draft state (it changes nothing until a drop) and not an action,
// but shared by every row because the feedback has to escalate across the whole list. Each row
// derives its own slice — which edge carries the insertion line, whether its link chip is the
// live target, whether its container is about to gain or lose a member — from the one classified
// descriptor, so the visuals can never promise an outcome the drop will not deliver (#219).
export interface PrescriptionDraftMeta {
  // The row currently being dragged (`row-<pos>`), or null when idle.
  draggingId: string | null;
  feedback: DragFeedback | null;
  // The target-anchored microcopy a pointer/touch user reads *before* release (#220), or null
  // when nothing valid is under the pointer. One string for the whole drag: a row renders it
  // only where it is the active drop target, so it never double-shows.
  foreshadow: string | null;
}

export interface PrescriptionDraftContextValue {
  state: PrescriptionDraftState;
  actions: PrescriptionDraftActions;
  meta: PrescriptionDraftMeta;
}

// Private: a row reaches the draft through `usePrescriptionDraft`, and a provider supplies it
// through `PrescriptionDraftProvider`, so the context object itself is nobody else's handle.
const PrescriptionDraftContext =
  createContext<PrescriptionDraftContextValue | null>(null);

// Supply the draft to a row tree. `value` is the caller's to memoize — it owns the state the
// value is assembled from, so it is the only place that knows when the value really changed.
export function PrescriptionDraftProvider({
  value,
  children,
}: {
  value: PrescriptionDraftContextValue;
  children: ReactNode;
}) {
  return (
    <PrescriptionDraftContext value={value}>
      {children}
    </PrescriptionDraftContext>
  );
}

// Read the draft. Throws outside a provider rather than defaulting: a row with no draft behind
// it would render empty fields that silently discard every edit, which is worse than a crash at
// the one moment a developer can fix it.
export function usePrescriptionDraft(): PrescriptionDraftContextValue {
  const draft = use(PrescriptionDraftContext);
  if (draft === null) {
    throw new Error(
      "A Prescription row must render inside a PrescriptionDraftProvider.",
    );
  }
  return draft;
}
