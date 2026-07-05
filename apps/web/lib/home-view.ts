// Pure view-model transforms for the Home screen. NO I/O and NO server-only
// imports, so this is safe to import from both Server and Client Components (and
// is unit-testable in isolation). The server-only data access lives in
// `lib/home.ts`; the shapes it consumes come from `lib/protocols-types`.

import type { ProtocolProgress, ProtocolSession } from "./protocols-types";

// The Session Hero's headline stats — duration · modules · sets — for a Current
// Protocol's Next Session. Deliberately no target-calorie and no single volume /
// tonnage number: with free-text and percentage-based loads a single volume
// figure would silently mislead (ADR-0008), so the hero shows honest counts.
export interface HeroStats {
  // The Protocol's prescribed per-session duration, in minutes.
  durationMinutes: number;
  // How many Exercise Prescriptions (modules) the Next Session contains.
  modules: number;
  // The total prescribed sets across those Prescriptions.
  sets: number;
}

// A cell's position relative to the Next Session: already performed (`done`), the
// Next Session itself (`active`), or still to come (`upcoming`). Purely
// positional — no weekday or date semantics (ADR-0008).
export type WeekCellState = "done" | "active" | "upcoming";

// One Session cell within a week pill of the completion map.
export interface WeekCell {
  sessionId: number;
  position: number;
  state: WeekCellState;
}

// One week of the Protocol as a segmented pill: its 1-based week number, its
// ordered Session cells, and whether it is the current week (the one holding the
// Next Session). A pill's fill is a count of BINARY Session completions, never a
// per-session percentage (ADR-0008/0009).
export interface WeekPill {
  week: number;
  cells: WeekCell[];
  // True for the single week that holds the Next Session.
  isCurrent: boolean;
}

// The Home completion map view-model: every week of the Current Protocol in
// order, each a pill of done / active / upcoming Session cells, plus a
// `WEEK n/total` overline. Spans the whole Protocol so the strip answers "how far
// am I through the Protocol, and what is left?" (ADR-0009). Positional, not
// calendrical (ADR-0008). The protocol-level `X / N` count is NOT here — it lives
// once, on the Queue.
export interface WeekStrip {
  weeks: WeekPill[];
  // The 1-based week of the Next Session — the current week.
  currentWeek: number;
  // The Protocol's total number of weeks (equals `weeks.length`).
  totalWeeks: number;
  // The rendered overline, e.g. "WEEK 2/6".
  label: string;
}

function cellState(position: number, nextPosition: number): WeekCellState {
  if (position < nextPosition) return "done";
  if (position === nextPosition) return "active";
  return "upcoming";
}

// Derive the Home completion map from a Current Protocol: one pill per week across
// the whole Protocol (so the pill count matches the `WEEK n/total` overline), each
// carrying its Sessions in position order tagged done / active / upcoming relative
// to the Next Session, with the current week flagged. Returns null when the
// Protocol has no Next Session, so Home shows the map only for a live Current
// Protocol.
export function weekStrip(protocol: ProtocolProgress): WeekStrip | null {
  const next = protocol.next_session;
  if (!next) return null;

  // Group Sessions by their week so each pill draws from its own week's Sessions.
  const sessionsByWeek = new Map<number, ProtocolSession[]>();
  for (const session of protocol.sessions) {
    const bucket = sessionsByWeek.get(session.week);
    if (bucket) bucket.push(session);
    else sessionsByWeek.set(session.week, [session]);
  }

  // Iterate 1..weeks (not the grouped keys) so the pill count is tied to the
  // Protocol's total weeks and always matches the overline.
  const weeks: WeekPill[] = [];
  for (let week = 1; week <= protocol.weeks; week += 1) {
    const cells = (sessionsByWeek.get(week) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((session) => ({
        sessionId: session.session_id,
        position: session.position,
        state: cellState(session.position, next.position),
      }));
    weeks.push({ week, cells, isCurrent: week === next.week });
  }

  return {
    weeks,
    currentWeek: next.week,
    totalWeeks: protocol.weeks,
    label: `WEEK ${next.week}/${protocol.weeks}`,
  };
}

// Derive the hero stats from a Current Protocol. `modules` counts the Next
// Session's Prescriptions; `sets` sums their prescribed sets; duration is the
// Protocol's own `duration_minutes`. A Current Protocol from `/api/home` always
// carries a Next Session, but the type admits `null`, so an absent one yields
// zeroed counts rather than throwing.
export function heroStats(protocol: ProtocolProgress): HeroStats {
  const next: ProtocolSession | null = protocol.next_session;
  const prescriptions = next?.prescriptions ?? [];
  return {
    durationMinutes: protocol.duration_minutes,
    modules: prescriptions.length,
    sets: prescriptions.reduce((total, p) => total + p.sets, 0),
  };
}

// The most upcoming Sessions the Queue shows before deferring the rest to the
// Protocol detail's "view all". ADR-0008 calls for ≈3–5; five keeps the Home
// card scannable without a per-row completion ring.
export const QUEUE_CAP = 5;

// One Queue row: an upcoming un-performed Session's honest, calendar-free facts —
// its Week/Day position label, its module count (Exercise Prescriptions), and the
// Protocol's per-session duration. There is deliberately NO per-session
// completion or readiness percentage: completion is binary per Session (ADR-0008),
// so a per-row ring would be dishonest.
export interface QueueRow {
  sessionId: number;
  // 1-based absolute position of the Session within the Protocol.
  position: number;
  // The descriptive Week/Day position label, e.g. "W2 · D1".
  label: string;
  // How many Exercise Prescriptions (modules) the Session contains.
  modules: number;
  // The Protocol's prescribed per-session duration, in minutes.
  durationMinutes: number;
  // Whether this is the Next Session — the first upcoming row.
  isNext: boolean;
}

// The Queue view-model: the capped list of upcoming un-performed Sessions, plus
// the only honest completion aggregate — protocol-level `completed_count / total`
// as an `X / N` header, never a per-row percentage (ADR-0008). `hasMore` signals
// that upcoming Sessions were trimmed by the cap, so a "view all" affordance to
// the Protocol detail should be shown.
export interface QueueView {
  rows: QueueRow[];
  // How many Sessions have been performed so far.
  completedCount: number;
  // The Protocol's total number of Sessions.
  total: number;
  // The rendered completion header, e.g. "3 / 12".
  header: string;
  // How many upcoming un-performed Sessions exist in total (before the cap).
  totalUpcoming: number;
  // Whether the cap trimmed the list — i.e. there are more than `rows.length`.
  hasMore: boolean;
}

// Derive the Home Queue from a Current Protocol: the upcoming un-performed
// Sessions (those at or after the Next Session's position) in ascending position
// order, capped to `QUEUE_CAP`, the first flagged `NEXT`, plus the protocol-level
// `completed_count / total` completion header. Returns null when the Protocol has
// no Next Session, so Home shows the Queue only for a live Current Protocol.
export function queueView(protocol: ProtocolProgress): QueueView | null {
  const next = protocol.next_session;
  if (!next) return null;

  const upcoming = protocol.sessions
    .filter((session) => session.position >= next.position)
    .sort((a, b) => a.position - b.position);

  const rows: QueueRow[] = upcoming.slice(0, QUEUE_CAP).map((session) => ({
    sessionId: session.session_id,
    position: session.position,
    label: `W${session.week} · D${session.day}`,
    modules: session.prescriptions.length,
    durationMinutes: protocol.duration_minutes,
    isNext: session.position === next.position,
  }));

  const total = protocol.sessions.length;
  return {
    rows,
    completedCount: protocol.completed_count,
    total,
    header: `${protocol.completed_count} / ${total}`,
    totalUpcoming: upcoming.length,
    hasMore: upcoming.length > rows.length,
  };
}
