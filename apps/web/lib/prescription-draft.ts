import type { BuilderEvent } from "./protocol-builder.ts";

// The Session editor's row-scoped edit vocabulary (ADR-0105).
//
// A Prescription row raises 13 of the Builder reducer's events. All 13 carry a `sessionId`
// the row has no business knowing: which Session the matrix has open is the screen's state,
// not the row's. So the rows speak this session-free vocabulary, and the screen re-attaches
// the address on the way to the reducer.
//
// The *payloads* are derived from `BuilderEvent` rather than re-declared, so a new field on
// `EDIT_LOAD` reaches the rows with no second edit. Membership is a judgement — which events
// belong to a row rather than to the screen above it — so it is declared, below.

// Which reducer events a Prescription row raises. Everything else in `BuilderEvent` belongs to
// the screen: the Protocol's shape, Session add/remove/move, the F6 queue.
//
// `satisfies` is what keeps the list honest. Without it a name that no longer matches an event —
// a rename, a retirement — would make `Extract` yield nothing and the event would *silently drop
// out* of the vocabulary rather than fail; with it, the list stops compiling. `prescription-draft.test.ts`
// closes the other half by holding the sample events to this registry, so a 14th entry cannot be
// added without one.
export const ROW_SCOPED_EVENT_TYPES = [
  "EDIT_PRESCRIPTION",
  "EDIT_LOAD",
  "SET_SCHEME",
  "SET_SET_TYPE",
  "SET_TARGET_EFFORT",
  "SET_NOTE",
  "SET_QUANTITY",
  "EDIT_ROUND_REST",
  "REORDER_PRESCRIPTION",
  "GROUP_WITH_NEXT",
  "UNGROUP",
  "REMOVE_PRESCRIPTION",
  "RESOLVE_DROP",
] as const satisfies readonly BuilderEvent["type"][];

type RowScopedEventType = (typeof ROW_SCOPED_EVENT_TYPES)[number];

// Drop a key across a union *member by member*. A bare `Omit<A | B, k>` collapses the union
// into one object type whose fields are the intersection — the discriminant stops narrowing
// and `event.position` reads as possibly-absent. The conditional distributes instead.
type WithoutSessionId<T> = T extends { sessionId: number }
  ? Omit<T, "sessionId">
  : never;

// Every edit a row can raise, addressed by `position` alone.
export type PrescriptionEvent = WithoutSessionId<
  Extract<BuilderEvent, { type: RowScopedEventType }>
>;

// Re-attach the open Session's id, turning a row's event into one the reducer accepts. The
// one place the two vocabularies meet — a row's edit can only ever land on the Session the
// screen has open, because no row is in a position to name another one.
export function toBuilderEvent(
  sessionId: number,
  event: PrescriptionEvent,
): BuilderEvent {
  // A new object, never a `sessionId` stamped onto the caller's event. No cast: the spread
  // distributes over the union, so the compiler checks member by member that adding `sessionId`
  // back to a `WithoutSessionId<T>` reconstructs that member of `BuilderEvent` — which is what
  // makes the derived vocabulary load-bearing rather than decorative. An event that stopped
  // carrying a `sessionId` would leave the vocabulary here and fail at every row that raises it.
  return { ...event, sessionId };
}
