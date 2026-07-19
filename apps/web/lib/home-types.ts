// Shared Home constants and types. This module has NO server-only imports, so it
// is safe to import from both Server and Client Components. The server-only data
// access (Clerk auth + fetch) lives in `lib/home.ts`.

import type { ProtocolProgress } from "./protocols-types";
import type { OperatorLevel } from "./profile-progress-types";

// Mirrors the backend's Readiness enum (app/domain/readiness.py): the qualitative
// three-state signal shown on Home. Deliberately not a recovery percentage
// (ADR-0008) — with no plan calendar there is no honest basis for one.
export type Readiness = "READY" | "CAUTION" | "EXTRA_CAUTION";

// The account's read-time gamification figures shown in Home's OPERATOR STATUS
// section (issue #166). `xp` and `level` back the shared LevelBadge; `streak` is
// the weekly consecutive-week Streak (ADR-0019). Every figure is projected from
// the user's Logged Sessions through the same read model the Profile screen uses,
// so the two can never disagree. A brand-new user is Level 1, 0 XP, 0-week streak.
export interface Gamification {
  xp: number;
  level: OperatorLevel;
  streak: number;
}

// The user's most recent Personal Record shown in Home's OPERATOR STATUS section
// (issue #167): the newest PR by date across all Exercises — the Exercise it was set
// on (`exercise_id` + `exercise` name) and its new `estimated_1rm` on the ISO `date`.
// It is the glossary's Personal Record (ADR-0010), derived read-time from Logged Sets,
// never a raw "personal best". `null` when no absolute-Load PR in a trustworthy rep
// window exists — a brand-new account or a bodyweight-only trainee — so the line is
// hidden, never shown as "0 kg".
export interface LatestPr {
  exercise_id: number;
  exercise: string;
  estimated_1rm: number;
  date: string;
}

// The aggregated Home read. `current_protocol` is the progressed view of the
// user's Current Protocol — the most-recently-adopted Protocol still holding an
// un-performed Session — or `null` in the empty state (no Protocol, or all
// complete). `readiness` and `gamification` are present in both states.
// `latest_pr` is the newest Personal Record, or `null` when the user has none.
export interface HomeData {
  readiness: Readiness;
  current_protocol: ProtocolProgress | null;
  gamification: Gamification;
  latest_pr: LatestPr | null;
}

// How each Readiness state renders as a header badge — its display label and the
// Pulse accent it uses. Cyan reads calm, violet a mid warning, magenta an alarm.
export const READINESS_BADGE: Record<
  Readiness,
  { label: string; variant: "cyan" | "violet" | "magenta" }
> = {
  READY: { label: "READY", variant: "cyan" },
  CAUTION: { label: "CAUTION", variant: "violet" },
  EXTRA_CAUTION: { label: "EXTRA CAUTION", variant: "magenta" },
};
