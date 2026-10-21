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
import { formatShortDate } from "./date-format.ts";
import { bestEffortData, type BestEffortResult } from "./best-effort-read.ts";
import {
  GENERATE_PROTOCOL_CHOICE,
  newProtocolChoices,
  type ProtocolChoice,
} from "./curated-protocol-view.ts";

// The Session Hero's headline stats — duration · modules · sets — for a Current
// Protocol's Next Session. Deliberately no target-calorie and no single volume /
// tonnage number: with free-text and percentage-based loads a single volume
// figure would silently mislead (ADR-0008), so the hero shows honest counts.
export interface HeroStats {
  // The Next Session's own prescribed duration, in minutes (#707): a Session may be typed
  // apart from its Protocol, so a run day reads its own length, not the plan's.
  durationMinutes: number;
  // The Next Session's own Training Type, which its Workout Signature is coloured by.
  trainingType: string;
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
// Session's Prescriptions; `sets` sums their prescribed sets; duration and Training
// Type are the Next Session's own (#707). A Current Protocol from `/api/home` always
// carries a Next Session, but the type admits `null`, so an absent one yields
// zeroed counts and the Protocol's duration and type rather than throwing.
export function heroStats(protocol: ProtocolProgress): HeroStats {
  const next: ProtocolSession | null = protocol.next_session;
  const prescriptions = next?.prescriptions ?? [];
  return {
    durationMinutes: next?.duration_minutes ?? protocol.duration_minutes,
    trainingType: next?.training_type ?? protocol.training_type,
    modules: prescriptions.length,
    sets: prescriptions.reduce((total, p) => total + p.sets, 0),
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
  // The caption under the count, e.g. "3" over "WEEKS IN A ROW". Weekly by construction —
  // never a daily / don't-break-the-chain framing (ADR-0019).
  streakCaption: string;
  // A fixed row of `STREAK_PIPS` marks, one filled per consecutive week, saturating once the
  // Streak outruns the row (the number carries the real count). An unfilled pip is neutral —
  // a week not yet reached, never a "missed" one.
  streakPips: readonly boolean[];
}

// How many pips the scoreboard's Streak row draws.
export const STREAK_PIPS = 8;

// Derive the OPERATOR STATUS view-model from the Home read's gamification block.
// A pure pass-through of the honest figures plus the weekly Streak caption and pips; the
// Level/XP go untouched to the shared LevelBadge so Home and Profile render the
// exact same number.
export function operatorStatus(gamification: Gamification): OperatorStatus {
  return {
    xp: gamification.xp,
    level: gamification.level,
    streak: gamification.streak,
    streakCaption: gamification.streak === 1 ? "WEEK IN A ROW" : "WEEKS IN A ROW",
    streakPips: Array.from({ length: STREAK_PIPS }, (_, i) => i < gamification.streak),
  };
}

// The Home "Latest PR" line view-model (issue #167): the user's most recent Personal
// Record, ready to render in OPERATOR STATUS. `exercise` names the lift and
// `exerciseId` links to it; `estimate` is the honest headline — an absolute record's
// whole-kg Estimated 1RM ("142 kg est. 1RM"), or a bodyweight record's set
// ("bodyweight × 12"), matching the Recent Records feed so a PR reads the same
// everywhere (ADR-0026) — and `headline` / `headlineCaption` split it for the operator
// scoreboard's big figure. The label is "Latest PR"
// (never "Top PR", which collides with Top Set, nor the banned "Personal Best") and
// lives in the component; the estimate is deliberately never "0 kg".
export interface LatestPrLine {
  exercise: string;
  exerciseId: number;
  // The honest headline: "142 kg est. 1RM" for an absolute record, "bodyweight × 12"
  // for a bodyweight one.
  estimate: string;
  // The scoreboard's big figure: "142 kg" for an absolute record, the whole set for a
  // bodyweight one.
  headline: string;
  // The caption under it: "EST. 1RM" for an absolute record, null for a bodyweight set,
  // which is not an estimate.
  headlineCaption: string | null;
  // The day the record was set, e.g. "JUL 10" — a calendar date, never "N days ago".
  dateLabel: string;
}

// Derive the Latest-PR line from the Home read's `latest_pr`. Returns null when the
// user has no Personal Record (a brand-new account), so the scoreboard's PR half shows its
// empty state rather than fabricating a "0 kg" — Level and Streak still render. A bodyweight record renders as
// the set that achieved it (ADR-0026); an absolute one keeps its "kg est. 1RM" wording.
export function latestPrLine(
  latestPr: LatestPr | null,
  unit: WeightUnit,
): LatestPrLine | null {
  if (!latestPr) return null;
  const dateLabel = formatShortDate(latestPr.date).toUpperCase();
  if (latestPr.is_bodyweight) {
    const set = formatRecordAchievement(latestPr, unit);
    return {
      exercise: latestPr.exercise,
      exerciseId: latestPr.exercise_id,
      estimate: set,
      headline: set,
      headlineCaption: null,
      dateLabel,
    };
  }
  const weight = formatWholeWeight(latestPr.estimated_1rm, unit);
  return {
    exercise: latestPr.exercise,
    exerciseId: latestPr.exercise_id,
    estimate: `${weight} est. 1RM`,
    headline: weight,
    headlineCaption: "EST. 1RM",
    dateLabel,
  };
}

// The ways Home's empty state offers to get a Protocol (issue #690, ADR-0130). With a Current
// Protocol there are none: the hero takes the slot and Home is unchanged. Without one, "Choose a
// Curated Protocol" sits beside "Generate for me" as an equal choice — the new-Protocol entry
// point's own two links, so it leads into the same picker and adopt flow. Curated Protocols are
// offered only once one is released, and a failed list read leaves the generate link on its own,
// as Home was before.
export function homeProtocolChoices(
  currentProtocol: ProtocolProgress | null,
  curatedProtocols: BestEffortResult<readonly unknown[]> | null,
): ProtocolChoice[] {
  if (currentProtocol) return [];
  const hasCuratedProtocols = (bestEffortData(curatedProtocols)?.length ?? 0) > 0;
  if (!hasCuratedProtocols) return [GENERATE_PROTOCOL_CHOICE];
  return newProtocolChoices("generate", { hasCuratedProtocols }).map(
    ({ surface, label, href }) => ({ surface, label, href }),
  );
}
