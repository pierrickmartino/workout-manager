// View-model for the Protocol overview's schedule (Q2/Q3/Q4/Q8/Q9). Pure and
// browser-safe (no server-only imports), like `recent-sessions` and `home-view`, so it
// is unit-testable without a browser and the Server Component calls it directly.
//
// It decides, per schedule Session, what the card *does* — the affordance, not the
// layout. Three states fall out of the cardinal plan≠record split and the self-paced
// rule (ADR-0001/0013):
//
//   - "next"      the one un-performed Session the user should run. Views the plan
//                 detail; Starts into the Live route — but only when this is the
//                 Current Protocol, so a set-aside (superseded) protocol never offers
//                 Start (the supersede one-way door).
//   - "performed" a settled record. Links to the *record* (History), never the plan
//                 detail — which would offer Start/Log on a finished Session and blur
//                 plan vs. record.
//   - "future"    an un-performed Session past the next one. Informational only: no
//                 card-level link and no Start (its exercises still link out in the UI),
//                 because jumping ahead has no domain meaning and the plan is already
//                 shown inline on the overview.
//
// The component decides *where* Start is rendered (the Next Up hero owns it; the
// schedule row for the same Session shows only the detail link) — this module just
// supplies the hrefs.

import type { ProtocolSession } from "./protocols-types";

// The affordance for one schedule card, as a discriminated union so the component
// renders exactly the links each state has.
export type ProtocolScheduleCard =
  | { state: "next"; detailHref: string; startHref: string | null }
  | { state: "performed"; recordHref: string | null }
  | { state: "future" };

export interface ProtocolCardContext {
  // Whether this Session is the Protocol's Next Session (its `session_id` matches
  // `next_session`). The Next Session is un-performed by definition.
  isNext: boolean;
  // Whether the Protocol being viewed is the user's Current Protocol. Gates Start:
  // a superseded protocol is view/history-only (ADR-0008, supersede one-way door).
  isCurrentProtocol: boolean;
}

// The fields the view-model reads — kept to a `Pick` so callers (and tests) need only
// supply these three.
type ScheduleSession = Pick<
  ProtocolSession,
  "session_id" | "performed" | "logged_session_id"
>;

// Where Start goes: straight into the plan's Live Session (Q2), matching the Session
// Hero and Recent Sessions. The concurrency guard for an already-running Live Session
// lives in `LiveSessionScreen` (ADR-0012), so deep-linking here is safe.
function liveHref(sessionId: number): string {
  return `/sessions/${sessionId}/live`;
}

// The plan detail (view) for a Session.
function detailHref(sessionId: number): string {
  return `/sessions/${sessionId}`;
}

// The record (History) detail, keyed by the *Logged Session* id — not the plan's
// `session_id` (plan≠record).
function recordHref(loggedSessionId: number): string {
  return `/history/${loggedSessionId}`;
}

// Resolve one schedule Session to its card affordance. `isNext` wins over `performed`
// (the Next Session is un-performed anyway), so the next row is never treated as a
// plain future row.
export function protocolScheduleCard(
  session: ScheduleSession,
  { isNext, isCurrentProtocol }: ProtocolCardContext,
): ProtocolScheduleCard {
  if (isNext) {
    return {
      state: "next",
      detailHref: detailHref(session.session_id),
      startHref: isCurrentProtocol ? liveHref(session.session_id) : null,
    };
  }
  if (session.performed) {
    return {
      state: "performed",
      recordHref:
        session.logged_session_id !== null
          ? recordHref(session.logged_session_id)
          : null,
    };
  }
  return { state: "future" };
}
