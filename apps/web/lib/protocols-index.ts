// View-model for the Protocols index (issue #637): every Protocol the user owns, in three
// groups — the Current one pinned, then those Set aside, then those Finished (GLOSSARY). NO
// server-only imports, so it is unit-testable and safe from any component.
//
// The server decides each row's `status` (it owns Current Protocol selection, ADR-0125); this
// module only groups, orders and phrases. Progress is "N of M sessions", never a score or a
// percentage. `made_current_at` is an ordering key only — the app is calendar-free (ADR-0001),
// so it is never shown.
//
// It also decides each row's actions (issue #638). Only a set-aside row offers Switch: Current
// already is Current, and a Finished Protocol has no Next Session to drive Home. While the
// persisted Live Session slot holds an unfinished performance the signed-in account owns, Switch
// is blocked on every row with a reason, so Home never shows one plan mid-workout on another.
// That guard is client-only because the server cannot see the slot (ADR-0012, ADR-0059).

import { formatLongDate } from "./date-format.ts";
import { parseApiInstant } from "./instant.ts";
import { ownsLiveSlot, type LiveSessionState } from "./live-session.ts";

export type ProtocolStatus = "current" | "set_aside" | "finished";

// One row of `GET /api/protocols`.
export interface ProtocolIndexEntry {
  id: number;
  // The user-editable name (nullable) and its resolved display label (ADR-0021).
  name: string | null;
  label: string;
  objective: string;
  training_type: string;
  status: ProtocolStatus;
  performed_count: number;
  session_count: number;
  // ISO `yyyy-mm-dd` of the latest performed Session, or null when none is performed.
  last_performed_on: string | null;
  // ISO instant the user last made this Protocol Current — ordering only.
  made_current_at: string;
}

// What a row offers for Switch: the action itself, or the action blocked with a reason the
// user can read and a way back to the Live Session that blocks it.
export type SwitchAction =
  | { kind: "available"; protocolId: number }
  | { kind: "blocked"; reason: string; resumeHref: string };

export interface ProtocolIndexRowView {
  id: number;
  title: string;
  // The derived "objective · training type" under a user-given name; null when the title
  // already is that derived label.
  subtitle: string | null;
  progress: string;
  lastPerformed: string | null;
  href: string;
  // Null on a row that never offers Switch (Current, Finished).
  switchAction: SwitchAction | null;
}

// The persisted Live Session slot and the signed-in account, read on the client. Absent on the
// server render, where no slot is visible: nothing is blocked until the slot has been read.
export interface LiveSessionContext {
  liveSlot: LiveSessionState | null;
  accountId: string | null;
}

const NO_LIVE_SESSION: LiveSessionContext = { liveSlot: null, accountId: null };

export const SWITCH_BLOCKED_REASON =
  "Finish or resume your live session before you switch protocols.";

export interface ProtocolIndexGroup {
  status: ProtocolStatus;
  heading: string;
  rows: ProtocolIndexRowView[];
}

export interface ProtocolsIndexView {
  isEmpty: boolean;
  groups: ProtocolIndexGroup[];
}

const GROUP_HEADINGS: Record<ProtocolStatus, string> = {
  current: "Current",
  set_aside: "Set aside",
  finished: "Finished",
};

const GROUP_ORDER: readonly ProtocolStatus[] = ["current", "set_aside", "finished"];

// Matches the server's derived-label separator (`app/domain/protocol.py`).
const LABEL_SEPARATOR = " · ";

// Newest first by the instant it was made Current, compared as instants through the shared
// API-instant parser (an offsetless value reads as UTC, ADR-0096); an unparseable one sorts
// last. Ties fall to the higher id, the server's tie-break.
function byMadeCurrent(a: ProtocolIndexEntry, b: ProtocolIndexEntry): number {
  const left = parseApiInstant(a.made_current_at) ?? Number.NEGATIVE_INFINITY;
  const right = parseApiInstant(b.made_current_at) ?? Number.NEGATIVE_INFINITY;
  return right - left || b.id - a.id;
}

// Newest first by last performance. ISO calendar dates order as strings; a never-performed
// row (not expected among Finished, but harmless) sorts last.
function byLastPerformed(a: ProtocolIndexEntry, b: ProtocolIndexEntry): number {
  const left = a.last_performed_on ?? "";
  const right = b.last_performed_on ?? "";
  if (left !== right) {
    return left < right ? 1 : -1;
  }
  return b.id - a.id;
}

function progressText(performed: number, total: number): string {
  return `${performed} of ${total} ${total === 1 ? "session" : "sessions"}`;
}

// The Live Session that blocks Switch: an unfinished slot owned by the signed-in account, the
// same slot Home offers to resume. A slot another account left behind blocks nothing.
function blockingLiveSessionId({ liveSlot, accountId }: LiveSessionContext): number | null {
  if (liveSlot === null || liveSlot.status === "finished") return null;
  return ownsLiveSlot(liveSlot, accountId) ? liveSlot.sessionId : null;
}

function switchActionFor(
  entry: ProtocolIndexEntry,
  liveSessionId: number | null,
): SwitchAction | null {
  if (entry.status !== "set_aside") return null;
  if (liveSessionId === null) return { kind: "available", protocolId: entry.id };
  return {
    kind: "blocked",
    reason: SWITCH_BLOCKED_REASON,
    resumeHref: `/sessions/${liveSessionId}/live`,
  };
}

function toRow(entry: ProtocolIndexEntry, liveSessionId: number | null): ProtocolIndexRowView {
  // Named exactly when the server's label rule would use the name: non-blank once trimmed.
  const isNamed = (entry.name ?? "").trim() !== "";
  return {
    id: entry.id,
    title: entry.label,
    subtitle: isNamed
      ? `${entry.objective}${LABEL_SEPARATOR}${entry.training_type}`
      : null,
    progress: progressText(entry.performed_count, entry.session_count),
    lastPerformed:
      entry.last_performed_on === null
        ? null
        : `Last performed ${formatLongDate(entry.last_performed_on)}`,
    href: `/protocols/${entry.id}`,
    switchAction: switchActionFor(entry, liveSessionId),
  };
}

// Group, order and phrase the index rows, and decide what each row offers. Groups with no rows
// are dropped, so a heading never opens an empty list.
export function protocolsIndex(
  entries: readonly ProtocolIndexEntry[],
  live: LiveSessionContext = NO_LIVE_SESSION,
): ProtocolsIndexView {
  const liveSessionId = blockingLiveSessionId(live);
  const groups = GROUP_ORDER.map((status) => {
    const members = entries.filter((entry) => entry.status === status);
    const ordered = [...members].sort(
      status === "finished" ? byLastPerformed : byMadeCurrent,
    );
    return { status, heading: GROUP_HEADINGS[status], rows: ordered.map((entry) => toRow(entry, liveSessionId)) };
  }).filter((group) => group.rows.length > 0);
  return { isEmpty: groups.length === 0, groups };
}
