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

// A dot's position relative to the Next Session: already performed (`done`), the
// Next Session itself (`active`), or still to come (`upcoming`). Purely
// positional — no weekday or date semantics (ADR-0008).
export type WeekDotState = "done" | "active" | "upcoming";

// One position dot in the Week Cycle strip.
export interface WeekDot {
  sessionId: number;
  position: number;
  state: WeekDotState;
}

// The Week Cycle strip view-model: the current week's Sessions as position dots
// plus a `WEEK n/total` overline. Positional, not calendrical (ADR-0008).
export interface WeekStrip {
  dots: WeekDot[];
  // The 1-based week of the Next Session — the current week.
  week: number;
  // The Protocol's total number of weeks.
  totalWeeks: number;
  // The rendered overline, e.g. "WEEK 2/6".
  label: string;
}

function dotState(position: number, nextPosition: number): WeekDotState {
  if (position < nextPosition) return "done";
  if (position === nextPosition) return "active";
  return "upcoming";
}

// Derive the Week Cycle strip from a Current Protocol: the Sessions of the
// current week (the week of the Next Session) as position dots, each tagged
// done / active / upcoming by position relative to the Next Session.
export function weekStrip(protocol: ProtocolProgress): WeekStrip | null {
  const next = protocol.next_session;
  if (!next) return null;
  const dots = protocol.sessions
    .filter((session) => session.week === next.week)
    .map((session) => ({
      sessionId: session.session_id,
      position: session.position,
      state: dotState(session.position, next.position),
    }));
  return {
    dots,
    week: next.week,
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
