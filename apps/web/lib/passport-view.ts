import type { Achievement } from "./profile-progress-types";
import { formatLongDate } from "./date-format.ts";

// One earned Achievement, presented as a Stamp in the Training Passport.
export interface Stamp {
  id: string;
  name: string;
  criteria: string;
  // The date it was earned, with the year ("Jul 4, 2026"), or null if the API sent none.
  earnedOn: string | null;
}

// One locked Achievement, with its live progress toward the target and a clamped 0–1 `fill`
// for its meter.
export interface Milestone {
  id: string;
  name: string;
  criteria: string;
  progress: string;
  fill: number;
}

// The Training Passport: the Achievements presented as a collection (ADR-0126).
export interface Passport {
  // Earned Achievements, oldest first; a same-day tie keeps catalog order.
  stamps: Stamp[];
  // The one locked Achievement closest to earned, or null once everything is earned.
  next: Milestone | null;
  // Every other locked Achievement, in catalog order, behind the "More to earn" disclosure.
  moreToEarn: Milestone[];
  moreToEarnCount: number;
  // Nothing earned yet: the Passport shows its empty state rather than a list of locks.
  empty: boolean;
}

interface CatalogEntry {
  achievement: Achievement;
  index: number;
}

// The ISO date an earned Achievement sorts by. An earned Achievement always carries one; a
// missing date sorts last rather than throwing, so a malformed row never blanks the Passport.
function earnedSortKey(achievement: Achievement): string {
  return achievement.unlocked_on ?? "9999-12-31";
}

// How far a locked Achievement is toward its target, from 0 to 1. Guards the divide (a curated
// target is always positive, but never trust it to) and clamps an overshooting count.
function ratio(achievement: Achievement): number {
  if (achievement.target <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, achievement.current / achievement.target));
}

// The week-streak Achievements count the user's longest run of consecutive weeks, never a
// current run that a rest week could break (ADR-0019), and their progress says so.
const STREAK_PREFIX = "streak-";

function progressLabel(achievement: Achievement): string {
  const fraction = `${achievement.current}/${achievement.target}`;
  return achievement.id.startsWith(STREAK_PREFIX)
    ? `Best run ${fraction} consecutive weeks`
    : fraction;
}

function toMilestone(achievement: Achievement): Milestone {
  return {
    id: achievement.id,
    name: achievement.name,
    criteria: achievement.criteria,
    progress: progressLabel(achievement),
    fill: ratio(achievement),
  };
}

// The locked Achievement proportionally closest to earned. Only a strictly higher ratio
// displaces the current pick, so a tie keeps the one earlier in the catalog.
function closestToEarned(locked: readonly CatalogEntry[]): CatalogEntry | null {
  return locked.reduce<CatalogEntry | null>(
    (best, entry) =>
      best === null || ratio(entry.achievement) > ratio(best.achievement) ? entry : best,
    null,
  );
}

// Build the Passport from the API's evaluated Achievements, which arrive in curated catalog
// order. Pure and server-free, so it is safe from either a Server or Client Component.
export function toPassport(achievements: readonly Achievement[]): Passport {
  const catalog = achievements.map((achievement, index) => ({ achievement, index }));
  const stamps = catalog
    .filter(({ achievement }) => achievement.unlocked)
    .toSorted(
      (a, b) =>
        earnedSortKey(a.achievement).localeCompare(earnedSortKey(b.achievement)) ||
        a.index - b.index,
    )
    .map(({ achievement }) => ({
      id: achievement.id,
      name: achievement.name,
      criteria: achievement.criteria,
      earnedOn:
        achievement.unlocked_on === null ? null : formatLongDate(achievement.unlocked_on),
    }));
  const locked = catalog.filter(({ achievement }) => !achievement.unlocked);
  const next = closestToEarned(locked);
  const moreToEarn = locked
    .filter((entry) => entry !== next)
    .map(({ achievement }) => toMilestone(achievement));
  return {
    stamps,
    next: next === null ? null : toMilestone(next.achievement),
    moreToEarn,
    moreToEarnCount: moreToEarn.length,
    empty: stamps.length === 0,
  };
}
