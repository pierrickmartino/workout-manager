// The client mirror of the contiguity gate (ADR-0034): decide whether deleting a
// Logged Session would be refused by the server, so the History delete control can be
// disabled before the user clicks it. Pure and browser-safe (no server-only imports) —
// the twin of the backend's `app/domain/contiguity.py`, kept here so the disabling rule
// is unit-tested in `lib/` rather than re-derived inside the component. The server stays
// authoritative (it returns 409); this is a courtesy that avoids a surprising rejection.

import type { LoggedSession } from "./logs-types";

// A log advances its Protocol (ADR-0013) unless it is declared Incomplete; an undeclared
// (null) outcome still advances, matching the backend's `_advances`.
const INCOMPLETE = "incomplete";

const TAIL_FIRST_REASON =
  "Undo the later sessions in this protocol first — deleting this one would leave a gap " +
  "in your performed sequence.";

export interface DeletionVerdict {
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

// Whether deleting `record` would break the gap-free performed sequence, given the user's
// full logged `history` and the parent Protocols' Session orderings (`protocolSessionOrders`
// — each an array of session_ids in position order, e.g. from the current protocol's
// sessions). Mirrors the backend rule exactly: refuse iff the delete removes the target's
// Session from the performed set AND a later-positioned Session in the same Protocol is
// still performed. Everything else — plan-less, standalone, last-performed, or a Session
// kept performed by another log — is allowed.
export function evaluateDeletion(
  record: LoggedSession,
  history: LoggedSession[],
  protocolSessionOrders: number[][],
): DeletionVerdict {
  const sessionId = record.session_id;
  if (sessionId === null) return { allowed: true, reason: null };

  const performedBefore = performedSessionIds(history);
  const performedAfter = performedSessionIds(
    history.filter((entry) => entry.id !== record.id),
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
