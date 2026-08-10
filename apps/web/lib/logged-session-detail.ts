// The Logged Session detail view-model: decide what the record detail page (`/history/[id]`)
// can offer for a record, keyed off the plan/record boundary (ADR-0031/0044). Pure and
// browser-safe, so the "which reuse action, which links" rules are unit-tested here and the
// page stays a thin renderer.
//
// The cardinal split drives it: a **plan-backed** record (it has a `session_id`) reuses its
// plan through Duplicate (ADR-0043) and links back to that plan; a **plan-less** (ad-hoc)
// record has no plan, so it offers Capture (ADR-0044) — promote it into a new reusable plan
// — instead. The two are mutually exclusive.

import type { LoggedSession } from "./logs-types";

const SECONDS_PER_MINUTE = 60;

export interface LoggedSessionDetailView {
  // Whether the record was performed against a Session (a plan), as opposed to an ad-hoc log.
  isPlanBacked: boolean;
  // The source plan to link back to (`/sessions/{id}`), or null for a plan-less record.
  sourceSessionHref: string | null;
  // A plan-backed record can Duplicate its source plan (ADR-0043).
  canDuplicate: boolean;
  // The source plan's id, for the Duplicate control; null when plan-less.
  sourceSessionId: number | null;
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

// Derive the detail page's capabilities for one record. Duplicate and Capture are mutually
// exclusive — a record either has a plan to duplicate or is ad-hoc and can be captured.
export function loggedSessionDetail(
  record: LoggedSession,
): LoggedSessionDetailView {
  const isPlanBacked = record.session_id !== null;
  return {
    isPlanBacked,
    sourceSessionHref: isPlanBacked ? `/sessions/${record.session_id}` : null,
    canDuplicate: isPlanBacked,
    sourceSessionId: record.session_id,
    canCapture: !isPlanBacked,
    captureHref: `/history/${record.id}/capture`,
    editHref: `/history/${record.id}/edit`,
    durationLabel: durationLabel(record.duration_seconds),
  };
}
