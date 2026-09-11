// The single source of truth for a Logged Session's **reuse affordance** — which one of the
// two mutually exclusive reuse actions a record offers, and where it goes. Pure and
// browser-safe, so both the History row and the record detail page derive it here and can
// never disagree (that's the whole reason it's extracted).
//
// The cardinal plan/record split drives it (ADR-0031/0044): a **plan-backed** record (it has
// a `session_id`) reuses its plan by **Repeat** (Q9) — jumping back to that existing plan to
// Start/Log it again, with no new copy spawned; a **plan-less** (ad-hoc) record has no plan,
// so it offers **Capture** (ADR-0044) — promote it into a new reusable plan — instead. The
// two are never both offered.

import type { LoggedSession } from "./logs-types";

export interface SessionReuseView {
  // Whether the record was performed against a Session (a plan), as opposed to an ad-hoc log.
  isPlanBacked: boolean;
  // A plan-backed record can Repeat its source plan (Q9): reuse the existing plan (Start or
  // Log it again) rather than spawning a copy. False for a plan-less record.
  canRepeat: boolean;
  // Where Repeat goes — the existing source plan page (`/sessions/{id}`), which offers Start
  // and Log. Null when plan-less (nothing to repeat).
  repeatHref: string | null;
  // A plan-less record can be Captured into a new reusable plan (ADR-0044). False when plan-backed.
  canCapture: boolean;
  // Where the Capture action goes — the pre-filled, plan-only builder, keyed off the record's
  // own id (there is no plan to key off).
  captureHref: string;
}

// Derive the reuse affordance for one record. Repeat and Capture are mutually exclusive — a
// record either has a plan to repeat or is ad-hoc and can be captured. Accepts the minimal
// slice it needs, so it stays trivially callable from both consumers.
export function sessionReuse(
  record: Pick<LoggedSession, "id" | "session_id">,
): SessionReuseView {
  const isPlanBacked = record.session_id !== null;
  const repeatHref = isPlanBacked ? `/sessions/${record.session_id}` : null;
  return {
    isPlanBacked,
    canRepeat: isPlanBacked,
    repeatHref,
    canCapture: !isPlanBacked,
    captureHref: `/history/${record.id}/capture`,
  };
}
