// Pure view-model transforms for the Home screen. NO I/O and NO server-only
// imports, so this is safe to import from both Server and Client Components (and
// is unit-testable in isolation). The server-only data access lives in
// `lib/home.ts`; the shapes it consumes come from `lib/protocols-types`.

import type { ProtocolProgress, ProtocolSession } from "./protocols-types";
import type { Gamification, LatestPr } from "./home-types";
import type { OperatorLevel } from "./profile-progress-types";
import { formatRecordAchievement } from "./record-achievement.ts";
import type { WeightUnit } from "./weight-unit";
import { formatWholeWeight } from "./weight-format.ts";

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

// A stop's position relative to the Next Session on the training route: already
// performed (`done`), the Next Session itself (`next`), or still to come
// (`upcoming`). Purely positional — no weekday or date semantics (ADR-0008).
export type RouteStopState = "done" | "next" | "upcoming";

// One Session as a named stop on the route: its absolute 1-based position, its
// positional Week/Day, its display title (the "named stop", e.g. "Upper A"), and
// its state relative to the Next Session. `title` always resolves to something
// readable — a Session with no authored title falls back to a Week/Day label — so
// a stop is never blank.
export interface RouteStop {
  sessionId: number;
  position: number;
  week: number;
  day: number;
  title: string;
  state: RouteStopState;
}

// One week of the route: its 1-based number, its ordered stops, and whether it is
// the current week (the one holding the Next Session). Completion is BINARY per
// stop, never a per-session percentage (ADR-0008/0009).
export interface RouteWeek {
  week: number;
  stops: RouteStop[];
  // True for the single week that holds the Next Session.
  isCurrent: boolean;
}

// The Home training-route view-model: the whole Current Protocol as a route of
// named stops. `currentWeek` is surfaced up front; `weeks` carries every week in
// order for the expandable full-plan reveal, so the route answers "how far am I
// through the Protocol, and what is left?" (ADR-0009). Positional, never
// calendrical (ADR-0008). The two completion figures are deliberately kept
// SEPARATE and never conflated (the ambiguity behind the retired dots): `position`
// is where you are in the sequence — the N in "session N of M" — while
// `completedCount` is how many Sessions you have actually performed ("X done").
// Returns null when the Protocol has no Next Session, so Home shows the route only
// for a live Current Protocol.
export interface TrainingRoute {
  currentWeek: RouteWeek;
  weeks: RouteWeek[];
  // The 1-based week of the Next Session — the current week's number.
  currentWeekNumber: number;
  // The Protocol's total number of weeks (equals `weeks.length`).
  totalWeeks: number;
  // The rendered overline, e.g. "WEEK 2/6".
  weekLabel: string;
  // The 1-based position of the Next Session in the sequence — the N in "session
  // N of M". Distinct from `completedCount` (in a linear plan it is that + 1).
  position: number;
  // The Protocol's total number of Sessions — the M in "session N of M".
  total: number;
  // How many Sessions have actually been performed — "X completed".
  completedCount: number;
}

function stopState(position: number, nextPosition: number): RouteStopState {
  if (position < nextPosition) return "done";
  if (position === nextPosition) return "next";
  return "upcoming";
}

// A Session's readable stop title: its authored title (e.g. "Upper A"), or a
// positional "Week W · Day D" fallback when a Session carries no title.
function stopTitle(session: ProtocolSession): string {
  return session.title ?? `Week ${session.week} · Day ${session.day}`;
}

// Derive the Home training route from a Current Protocol: every week across the
// whole Protocol (so the week count matches the `WEEK n/total` overline), each
// carrying its Sessions in position order as named stops tagged done / next /
// upcoming relative to the Next Session, with the current week flagged and pulled
// out as `currentWeek`. The sequence position and the performed count are carried
// separately so the UI never conflates them. Returns null when the Protocol has no
// Next Session, so Home shows the route only for a live Current Protocol.
export function trainingRoute(protocol: ProtocolProgress): TrainingRoute | null {
  const next = protocol.next_session;
  if (!next) return null;

  // Group Sessions by their week so each week draws from its own Sessions.
  const sessionsByWeek = new Map<number, ProtocolSession[]>();
  for (const session of protocol.sessions) {
    const bucket = sessionsByWeek.get(session.week);
    if (bucket) bucket.push(session);
    else sessionsByWeek.set(session.week, [session]);
  }

  // Iterate 1..weeks (not the grouped keys) so the week count is tied to the
  // Protocol's total weeks and always matches the overline.
  const weeks: RouteWeek[] = [];
  for (let week = 1; week <= protocol.weeks; week += 1) {
    const stops = (sessionsByWeek.get(week) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((session) => ({
        sessionId: session.session_id,
        position: session.position,
        week: session.week,
        day: session.day,
        title: stopTitle(session),
        state: stopState(session.position, next.position),
      }));
    weeks.push({ week, stops, isCurrent: week === next.week });
  }

  const currentWeek = weeks.find((week) => week.isCurrent);
  if (!currentWeek) return null;

  return {
    currentWeek,
    weeks,
    currentWeekNumber: next.week,
    totalWeeks: protocol.weeks,
    weekLabel: `WEEK ${next.week}/${protocol.weeks}`,
    position: next.position,
    total: protocol.sessions.length,
    completedCount: protocol.completed_count,
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

// The Home OPERATOR STATUS view-model (issue #166): the account's Level / XP —
// passed straight through to the shared `LevelBadge` — plus an explicitly-weekly
// Streak label. Rendered in both the Current-Protocol and empty states, so the
// user always sees their honest standing. A brand-new user is Level 1, 0 XP, and
// a "0 WK STREAK".
export interface OperatorStatus {
  // The account's total XP — the LevelBadge's headline figure.
  xp: number;
  // Where that XP sits on the Operator Level curve — the LevelBadge's input.
  level: OperatorLevel;
  // The weekly consecutive-week Streak count (ADR-0019).
  streak: number;
  // The rendered, explicitly-weekly Streak label, e.g. "3 WK STREAK". Weekly by
  // construction — never a daily / don't-break-the-chain framing (ADR-0019).
  streakLabel: string;
}

// Derive the OPERATOR STATUS view-model from the Home read's gamification block.
// A pure pass-through of the honest figures plus the weekly Streak label; the
// Level/XP go untouched to the shared LevelBadge so Home and Profile render the
// exact same number.
export function operatorStatus(gamification: Gamification): OperatorStatus {
  return {
    xp: gamification.xp,
    level: gamification.level,
    streak: gamification.streak,
    streakLabel: `${gamification.streak} WK STREAK`,
  };
}

// The Home "Latest PR" line view-model (issue #167): the user's most recent Personal
// Record, ready to render in OPERATOR STATUS. `exercise` names the lift and
// `exerciseId` links to it; `estimate` is the honest headline — an absolute record's
// whole-kg Estimated 1RM ("142 kg est. 1RM"), or a bodyweight record's set
// ("bodyweight × 12"), matching the Recent Records feed so a PR reads the same
// everywhere (ADR-0026) — and `text` is the composed line. The label is "Latest PR"
// (never "Top PR", which collides with Top Set, nor the banned "Personal Best") and
// lives in the component; the estimate is deliberately never "0 kg".
export interface LatestPrLine {
  exercise: string;
  exerciseId: number;
  // The honest headline: "142 kg est. 1RM" for an absolute record, "bodyweight × 12"
  // for a bodyweight one.
  estimate: string;
  // The composed line, e.g. "Deadlift — 142 kg est. 1RM" or "Pull-up — bodyweight × 12".
  text: string;
}

// Derive the Latest-PR line from the Home read's `latest_pr`. Returns null when the
// user has no Personal Record (a brand-new account), so Home hides the line rather than
// fabricating a "0 kg" — Level and Streak still render. A bodyweight record renders as
// the set that achieved it (ADR-0026); an absolute one keeps its "kg est. 1RM" wording.
export function latestPrLine(
  latestPr: LatestPr | null,
  unit: WeightUnit,
): LatestPrLine | null {
  if (!latestPr) return null;
  const estimate = latestPr.is_bodyweight
    ? formatRecordAchievement(latestPr, unit)
    : `${formatWholeWeight(latestPr.estimated_1rm, unit)} est. 1RM`;
  return {
    exercise: latestPr.exercise,
    exerciseId: latestPr.exercise_id,
    estimate,
    text: `${latestPr.exercise} — ${estimate}`,
  };
}
