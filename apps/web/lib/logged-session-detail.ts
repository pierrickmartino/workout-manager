// The Logged Session detail view-model: decide what the record detail page (`/history/[id]`)
// can offer for a record, keyed off the plan/record boundary (ADR-0031/0044). Pure and
// browser-safe, so the "which reuse action, which links" rules are unit-tested here and the
// page stays a thin renderer.
//
// The cardinal split drives it: a **plan-backed** record (it has a `session_id`) reuses its
// plan by **Repeat** (Q9) — jumping back to that existing plan to Start/Log it again, with
// no new copy spawned; a **plan-less** (ad-hoc) record has no plan, so it offers Capture
// (ADR-0044) — promote it into a new reusable plan — instead. The two are mutually
// exclusive. (Duplicate — forking a *separate* editable copy — lives on the Session view,
// not here; Repeat is the record-side "do this workout again".)

import type { LoggedSession } from "./logs-types";

const SECONDS_PER_MINUTE = 60;

export interface LoggedSessionDetailView {
  // Whether the record was performed against a Session (a plan), as opposed to an ad-hoc log.
  isPlanBacked: boolean;
  // The source plan to link back to (`/sessions/{id}`), or null for a plan-less record.
  sourceSessionHref: string | null;
  // A plan-backed record can Repeat its source plan (Q9): reuse the existing plan (Start or
  // Log it again) rather than spawning a copy. False for a plan-less record.
  canRepeat: boolean;
  // Where Repeat goes — the existing source plan page (`/sessions/{id}`), which offers Start
  // and Log. Null when plan-less (nothing to repeat).
  repeatHref: string | null;
  // A plan-less record can be Captured into a new reusable plan (ADR-0044).
  canCapture: boolean;
  // Where the Capture action goes — the pre-filled, plan-only builder.
  captureHref: string;
  // Where the correction (edit) form lives.
  editHref: string;
  // The recorded Session Duration as `m:ss` (or `h:mm:ss`), or null when unmeasured.
  durationLabel: string | null;
}

// Format whole seconds as `m:ss`, or `h:mm:ss` past an hour — the honest display of a
// measured Session Duration (ADR-0014). Null in, null out (an after-the-fact log measures none).
function durationLabel(totalSeconds: number | null): string | null {
  if (totalSeconds === null) return null;
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / (SECONDS_PER_MINUTE * SECONDS_PER_MINUTE));
  const minutes = Math.floor(rounded / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE;
  const seconds = rounded % SECONDS_PER_MINUTE;
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

// Derive the detail page's capabilities for one record. Repeat and Capture are mutually
// exclusive — a record either has a plan to repeat or is ad-hoc and can be captured.
export function loggedSessionDetail(
  record: LoggedSession,
): LoggedSessionDetailView {
  const isPlanBacked = record.session_id !== null;
  const sourceSessionHref = isPlanBacked ? `/sessions/${record.session_id}` : null;
  return {
    isPlanBacked,
    sourceSessionHref,
    canRepeat: isPlanBacked,
    repeatHref: sourceSessionHref,
    canCapture: !isPlanBacked,
    captureHref: `/history/${record.id}/capture`,
    editHref: `/history/${record.id}/edit`,
    durationLabel: durationLabel(record.duration_seconds),
  };
}
