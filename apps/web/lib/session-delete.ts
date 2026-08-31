import type { WorkoutSession } from "./sessions-types";

// View-models for the Delete affordance (CONTEXT: Delete, ADR-0063). Pure and server-free
// (types are erased), so the "when may this Session be deleted" rule is unit-tested here and
// the Session page and the My Sessions row stay thin. A Session is deletable only when it has
// no Logged Session — the read-time **Logged Count** — and is standalone.

// The one-line reason shown when Delete is disabled on the Session detail because the Session
// has logged training. Mirrors the server's 409 detail so the UI and the backstop agree.
export const DELETE_DISABLED_HINT =
  "A session with logged training can't be deleted.";

// The Session detail's Delete state. `show` gates whether the control renders at all: Delete is
// standalone-only (hidden on a Protocol member, like Rename/Favorite/Share) and needs the
// read-time Logged Count to be present (a read that omits it — live hydration — can't decide,
// so the control is hidden). `canDelete` is whether the click is allowed — true only at a zero
// Logged Count; otherwise the control is shown disabled with `DELETE_DISABLED_HINT`. `loggedCount`
// is surfaced so the disabled hint/count can be shown without re-reading the raw field.
export interface SessionDeleteView {
  show: boolean;
  canDelete: boolean;
  loggedCount: number;
}

// Map a Session onto its Delete view. The marker is a real number only on a standalone detail
// read; an absent count (a read that omits it) or a Protocol member means "not deletable here",
// so the control is hidden. When shown, deletion is allowed iff the Session has never been
// performed (count 0).
export function sessionDeleteView(session: WorkoutSession): SessionDeleteView {
  const hasCount = typeof session.logged_count === "number";
  const loggedCount = hasCount ? (session.logged_count as number) : 0;
  const show = hasCount && !session.is_protocol_member;
  return { show, canDelete: show && loggedCount === 0, loggedCount };
}

// The My Sessions row badge label for a Session's Logged Count, or `null` when the Session has
// never been performed (so an unperformed row reads clean and its Delete affordance shows). A
// singular/plural label so "1 LOGGED" never reads as "1 logged sessions".
export function loggedCountBadge(loggedCount: number): string | null {
  if (loggedCount <= 0) {
    return null;
  }
  return `${loggedCount} logged`;
}
