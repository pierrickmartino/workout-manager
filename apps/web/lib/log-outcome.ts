// The client mirror of the contiguity gate's flip-to-Incomplete branch (ADR-0034):
// decide whether correcting a Logged Session's Completion Outcome to Incomplete would be
// refused by the server, so the History outcome toggle can disable its "un-complete"
// affordance before the user clicks it. Pure and browser-safe (no server-only imports) —
// the twin of the backend's `evaluate_contiguity(FLIP_TO_INCOMPLETE)`, kept here so the
// disabling rule is unit-tested in `lib/`. The server stays authoritative (it returns
// 409); this only avoids a surprising rejection. The fill direction (Incomplete→Completed)
// only adds to the performed set, so it is never gated and needs no mirror.

import type { LoggedSession } from "./logs-types";

// A log advances its Protocol (ADR-0013) unless it is declared Incomplete; an undeclared
// (null) outcome still advances, matching the backend's `_advances`.
const INCOMPLETE = "incomplete";

const TAIL_FIRST_REASON =
  "Undo the later sessions in this protocol first — un-completing this one would leave " +
  "a gap in your performed sequence.";

export interface OutcomeVerdict {
  allowed: boolean;
  reason: string | null;
}

// The Session ids with at least one advancing Logged Session — the performed set the
// Next Session projection reads (a plan-less record contributes none).
function performedSessionIds(history: LoggedSession[]): Set<number> {
  const performed = new Set<number>();
  for (const entry of history) {
    if (entry.session_id !== null && entry.completion_outcome !== INCOMPLETE) {
      performed.add(entry.session_id);
    }
  }
  return performed;
}

// Whether flipping `record` to Incomplete would break the gap-free performed sequence,
// given the user's full logged `history` and the parent Protocols' Session orderings
// (`protocolSessionOrders` — each an array of session_ids in position order). Mirrors the
// backend's FLIP_TO_INCOMPLETE rule exactly: refuse iff the flip removes the target's
// Session from the performed set AND a later-positioned Session in the same Protocol is
// still performed. A flip removes the Session the same way a delete does — the target
// stops advancing — so the after-state drops it. Everything else — plan-less, standalone,
// last-performed, or a Session kept performed by another log — is allowed.
export function evaluateUncomplete(
  record: LoggedSession,
  history: LoggedSession[],
  protocolSessionOrders: number[][],
): OutcomeVerdict {
  const sessionId = record.session_id;
  if (sessionId === null) return { allowed: true, reason: null };

  const performedBefore = performedSessionIds(history);
  // After un-completing, the target no longer advances — model it as an Incomplete log.
  const performedAfter = performedSessionIds(
    history.map((entry) =>
      entry.id === record.id
        ? { ...entry, completion_outcome: INCOMPLETE }
        : entry,
    ),
  );

  const removesSession =
    performedBefore.has(sessionId) && !performedAfter.has(sessionId);
  if (!removesSession) return { allowed: true, reason: null };

  const order = protocolSessionOrders.find((ids) => ids.includes(sessionId));
  if (order === undefined) return { allowed: true, reason: null };

  const index = order.indexOf(sessionId);
  const laterPerformed = order
    .slice(index + 1)
    .some((id) => performedAfter.has(id));
  return laterPerformed
    ? { allowed: false, reason: TAIL_FIRST_REASON }
    : { allowed: true, reason: null };
}
