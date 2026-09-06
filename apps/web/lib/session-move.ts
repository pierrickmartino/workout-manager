// Tail-only Session reordering for the Protocol Builder (ADR-0068). Extracted from
// `protocol-builder.ts` so the move logic and its enablement view-model live together
// in one cohesive module, sharing a single "un-performed Sessions of a Week" query so
// the two can never drift. Pure: every function returns new data and never mutates its
// input, the same discipline as the reducer it feeds.

import type { BuilderDraft, DraftSession } from "./protocol-builder.ts";

// The un-performed Sessions of one Week, in day order — the ordering both the move and
// its enablement read. `excludeId` drops the Session being moved so callers can compute
// the destination run without it. Returns a fresh array; the input is untouched.
function unperformedInWeek(
  sessions: DraftSession[],
  week: number,
  excludeId?: number,
): DraftSession[] {
  return sessions
    .filter(
      (session) =>
        session.week === week &&
        !session.performed &&
        session.sessionId !== excludeId,
    )
    .sort((a, b) => a.day - b.day);
}

// The day just past the last frozen (performed) Session in a Week — the floor
// un-performed Sessions are packed above, so they never precede settled record.
function performedFloor(sessions: DraftSession[], week: number): number {
  const days = sessions
    .filter((session) => session.week === week && session.performed)
    .map((session) => session.day);
  return days.length > 0 ? Math.max(...days) : 0;
}

// Reposition the un-performed Session `sessionId` to slot `toIndex` among the
// un-performed Sessions of `toWeek`, rewriting only (week, day) (ADR-0068). Tail-only:
// a performed Session never moves and — crucially — its (week, day) is preserved, so
// un-performed Sessions are packed *after* the last performed day in a Week and a
// straddling Week never reorders its frozen prefix. The two affected Weeks (source and
// destination) are re-packed to contiguous days; the backend re-enumerates positions
// from the resulting (week, day) grid (`reenumerate_tail`). A missing or performed
// source, like an out-of-range `toIndex` (clamped), leaves the list untouched.
export function moveSession(
  sessions: DraftSession[],
  sessionId: number,
  toWeek: number,
  toIndex: number,
): DraftSession[] {
  const source = sessions.find((session) => session.sessionId === sessionId);
  if (!source || source.performed) return sessions;
  const fromWeek = source.week;

  const destination = unperformedInWeek(sessions, toWeek, sessionId);
  const index = Math.max(0, Math.min(toIndex, destination.length));
  destination.splice(index, 0, source);

  // New (week, day) for every un-performed Session the move re-packs.
  const relabelled = new Map<number, { week: number; day: number }>();
  const destFloor = performedFloor(sessions, toWeek);
  destination.forEach((session, i) => {
    relabelled.set(session.sessionId, { week: toWeek, day: destFloor + 1 + i });
  });
  if (fromWeek !== toWeek) {
    const sourceFloor = performedFloor(sessions, fromWeek);
    unperformedInWeek(sessions, fromWeek, sessionId).forEach((session, i) => {
      relabelled.set(session.sessionId, { week: fromWeek, day: sourceFloor + 1 + i });
    });
  }

  return sessions.map((session) => {
    const next = relabelled.get(session.sessionId);
    return next ? { ...session, week: next.week, day: next.day } : session;
  });
}

// Which tail-only moves are legal for one un-performed Session (ADR-0068) — the
// enablement the Session-level move controls read (the ADR-0027 keyboard/button floor
// beside drag). `index` is the Session's 0-based slot among its Week's un-performed
// Sessions; up/down reorder within the Week, prev/next carry it across a Week boundary.
export interface SessionMoveOptions {
  week: number;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canMoveToPrevWeek: boolean;
  canMoveToNextWeek: boolean;
}

// Derive the legal moves for the Session `sessionId`, or `null` when it cannot move —
// an unknown id or a performed (frozen) Session. Up/down are gated by its position
// among the Week's un-performed siblings; prev/next by the Protocol's Week bounds
// (`1..weeks`). `moveSession` is the backstop, so a stale enablement can never produce
// an illegal move.
export function sessionMoveOptions(
  draft: BuilderDraft,
  sessionId: number,
): SessionMoveOptions | null {
  const source = draft.sessions.find((session) => session.sessionId === sessionId);
  if (!source || source.performed) return null;
  const siblings = unperformedInWeek(draft.sessions, source.week);
  const index = siblings.findIndex((session) => session.sessionId === sessionId);
  return {
    week: source.week,
    index,
    canMoveUp: index > 0,
    canMoveDown: index >= 0 && index < siblings.length - 1,
    canMoveToPrevWeek: source.week > 1,
    canMoveToNextWeek: source.week < draft.weeks,
  };
}
