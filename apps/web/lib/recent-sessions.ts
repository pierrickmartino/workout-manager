// View-model for the Train page's "Recent Sessions" panel (GLOSSARY: Recent Sessions).
// Pure and browser-safe (no server-only imports), like `session-reuse` and `history-filter`,
// so it is unit-testable without a browser and the Server Component can call it directly.
//
// It surfaces the user's up-to-five most-recently-*performed* standalone Session **plans**,
// each as a one-tap Start into a Live Session — the proactive, Train-side cousin of Repeat
// (GLOSSARY: Repeat). The cardinal plan/record split drives it: recency and ordering come from
// the *record* (Logged Sessions), but every row is a *plan* (a standalone Session), so
// plan-less records are skipped (no plan to Start — they offer Capture on History) and
// Protocol-member performances are excluded (standalone-only, like My Sessions).

import type { LoggedSession } from "./logs-types";
import type { SessionSummary } from "./session-library";

// The panel shows at most five plans (Q3). Each renders as the shared Session card, whose exercise
// preview and "Last trained" date ride on the list row itself (ADR-0134).
export const MAX_RECENT_SESSIONS = 5;

// One selected plan to surface, paired with the date of its most recent performance. The
// selection is keyed off the record (which plans were performed, and when) but resolves to the
// standalone Session (the plan) it belongs to.
export interface RecentSessionSelection {
  session: SessionSummary;
  lastPerformedOn: string;
}

// Select the up-to-`limit` distinct standalone plans the user performed most recently.
//
// `history` is the record feed **newest-first** (the `GET /api/logs` contract, mirrored by
// `fetchHistory`); input order is preserved as the recency order rather than re-sorted, so
// same-day performances keep the server's intra-day ordering (`performed_on` is a date alone).
// `standaloneSessions` is the user's standalone library (`GET /api/sessions`) — the authority on
// which `session_id`s are standalone and the source of each plan's display fields.
//
// A record is eligible only when it is plan-backed (`session_id !== null`) AND that id is in the
// standalone library — so plan-less records (Capture's domain, not Start's) and Protocol-member
// performances are both dropped. The first (newest) performance of each plan wins and carries its
// `performed_on`; later repeats of the same plan are ignored.
export function selectRecentSessions(
  history: readonly LoggedSession[],
  standaloneSessions: readonly SessionSummary[],
  limit: number = MAX_RECENT_SESSIONS,
): RecentSessionSelection[] {
  const byId = new Map<number, SessionSummary>();
  for (const session of standaloneSessions) {
    byId.set(session.id, session);
  }

  const selected: RecentSessionSelection[] = [];
  const seen = new Set<number>();

  for (const record of history) {
    if (selected.length >= limit) break;
    const id = record.session_id;
    if (id === null) continue; // plan-less: no plan to Start (offers Capture on History)
    if (seen.has(id)) continue; // keep only the newest performance of each plan
    const session = byId.get(id);
    if (session === undefined) continue; // not standalone (Protocol member, or beyond the page)
    seen.add(id);
    selected.push({ session, lastPerformedOn: record.performed_on });
  }

  return selected;
}
