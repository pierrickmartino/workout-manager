// View-model for the Protocols index (issue #637): every Protocol the user owns, in three
// groups — the Current one pinned, then those Set aside, then those Finished (GLOSSARY). NO
// server-only imports, so it is unit-testable and safe from any component.
//
// The server decides each row's `status` (it owns Current Protocol selection, ADR-0125); this
// module only groups, orders and phrases. Progress is "N of M sessions", never a score or a
// percentage. `made_current_at` is an ordering key only — the app is calendar-free (ADR-0001),
// so it is never shown.

import { formatLongDate } from "./date-format.ts";

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

export interface ProtocolIndexRow {
  id: number;
  title: string;
  // The derived "objective · training type" under a user-given name; null when the title
  // already is that derived label.
  subtitle: string | null;
  progress: string;
  lastPerformed: string | null;
  href: string;
}

export interface ProtocolIndexGroup {
  status: ProtocolStatus;
  heading: string;
  rows: ProtocolIndexRow[];
}

export interface ProtocolsIndex {
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

// Newest first by the instant it was made Current, compared as instants (offsets differ);
// ties fall to the higher id, the server's tie-break.
function byMadeCurrent(a: ProtocolIndexEntry, b: ProtocolIndexEntry): number {
  return Date.parse(b.made_current_at) - Date.parse(a.made_current_at) || b.id - a.id;
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

function toRow(entry: ProtocolIndexEntry): ProtocolIndexRow {
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
  };
}

// Group, order and phrase the index rows. Groups with no rows are dropped, so a heading never
// opens an empty list.
export function protocolsIndex(entries: readonly ProtocolIndexEntry[]): ProtocolsIndex {
  const groups = GROUP_ORDER.map((status) => {
    const members = entries.filter((entry) => entry.status === status);
    const ordered = [...members].sort(
      status === "finished" ? byLastPerformed : byMadeCurrent,
    );
    return { status, heading: GROUP_HEADINGS[status], rows: ordered.map(toRow) };
  }).filter((group) => group.rows.length > 0);
  return { isEmpty: groups.length === 0, groups };
}
