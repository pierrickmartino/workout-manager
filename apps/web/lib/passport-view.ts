import type { Achievement } from "./profile-progress-types";
import { formatLongDate } from "./date-format.ts";

// One earned Achievement, presented as a Stamp in the Training Passport.
export interface Stamp {
  id: string;
  name: string;
  // The date it was earned, with the year ("Jul 4, 2026"), or null if the API sent none.
  earnedOn: string | null;
  // The Stamp's own page (#652).
  href: string;
}

// One locked Achievement, with its live progress toward the target and a clamped 0–1 `fill`
// for its meter.
export interface Milestone {
  id: string;
  name: string;
  criteria: string;
  progress: string;
  fill: number;
  // The Achievement's own page, which a locked one opens too (#652).
  href: string;
}

// The Training Passport: the Achievements presented as a collection (ADR-0126).
export interface Passport {
  // Earned Achievements, oldest first; a same-day tie keeps catalog order.
  stamps: Stamp[];
  // Nothing is earned yet: the Passport shows its empty state, which points Home, rather than
  // a page of locks (#651).
  empty: boolean;
  // The one locked Achievement closest to earned, or null once everything is earned.
  next: Milestone | null;
  // Every other locked Achievement, in catalog order, behind the "More to earn" disclosure.
  moreToEarn: Milestone[];
}

interface CatalogEntry {
  achievement: Achievement;
  index: number;
}

// An earned Achievement always carries its date; one that arrives without sorts after every
// real date rather than throwing, so a malformed row never blanks the Passport.
const UNDATED_SORTS_LAST = "9999-12-31";

function earnedSortKey(achievement: Achievement): string {
  return achievement.unlocked_on ?? UNDATED_SORTS_LAST;
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

// Every Achievement, earned or locked, opens its own page under the Achievements route, keyed
// by its id (#652).
export function stampHref(id: string): string {
  return `/profile/achievements/${encodeURIComponent(id)}`;
}

function toMilestone(achievement: Achievement): Milestone {
  return {
    id: achievement.id,
    name: achievement.name,
    criteria: achievement.criteria,
    progress: progressLabel(achievement),
    fill: ratio(achievement),
    href: stampHref(achievement.id),
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
      earnedOn:
        achievement.unlocked_on === null ? null : formatLongDate(achievement.unlocked_on),
      href: stampHref(achievement.id),
    }));
  const locked = catalog.filter(({ achievement }) => !achievement.unlocked);
  const next = closestToEarned(locked);
  const moreToEarn = locked
    .filter((entry) => entry !== next)
    .map(({ achievement }) => toMilestone(achievement));
  return {
    stamps,
    empty: stamps.length === 0,
    next: next === null ? null : toMilestone(next.achievement),
    moreToEarn,
  };
}

// An earned Achievement's page: what earned it in plain words, and a link to the Logged Session
// whose logging crossed its target (#652).
export interface EarnedStampDetail {
  status: "earned";
  id: string;
  name: string;
  // The earned date with the year, or null if the API sent none.
  earnedOn: string | null;
  explanation: string;
  // The crossing Logged Session's detail page in History, or null if the API named none — no
  // link rather than one to a missing record.
  sourceHref: string | null;
}

// A locked Achievement's page: its criteria and live progress, and no source to link.
export interface LockedStampDetail extends Omit<Milestone, "href"> {
  status: "locked";
}

export type StampDetail = EarnedStampDetail | LockedStampDetail;

// "1st", "2nd", "3rd", "4th"… with the teens all "th"; the first of anything reads as a word.
function ordinal(n: number): string {
  if (n === 1) {
    return "first";
  }
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${n}th`;
  }
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

// What the crossing session did, per Achievement family. The family is the id's prefix, as in
// the progress copy; the count is the target, since the crossing session is the one that
// reached it. Streaks count consecutive weeks, never a run that could be broken (ADR-0019).
function explanation(achievement: Achievement): string {
  const { id, target } = achievement;
  if (id.startsWith("sessions-")) {
    return `This was your ${ordinal(target)} logged session.`;
  }
  if (id.startsWith(STREAK_PREFIX)) {
    return `Your ${ordinal(target)} consecutive week of training was completed with this session.`;
  }
  if (id === "muscle-all") {
    return "With this session you had trained all six muscle groups.";
  }
  if (id === "first-pr") {
    return "This session set your first personal record.";
  }
  return `This session met the criteria: ${achievement.criteria}.`;
}

// The Stamp page for one Achievement, read from the same profile progress the Passport is: no
// endpoint of its own. Null when the catalog holds no such id, so the page renders not-found.
export function toStampDetail(
  achievements: readonly Achievement[],
  id: string,
): StampDetail | null {
  const achievement = achievements.find((candidate) => candidate.id === id);
  if (achievement === undefined) {
    return null;
  }
  if (!achievement.unlocked) {
    return {
      status: "locked",
      id: achievement.id,
      name: achievement.name,
      criteria: achievement.criteria,
      progress: progressLabel(achievement),
      fill: ratio(achievement),
    };
  }
  return {
    status: "earned",
    id: achievement.id,
    name: achievement.name,
    earnedOn:
      achievement.unlocked_on === null ? null : formatLongDate(achievement.unlocked_on),
    explanation: explanation(achievement),
    sourceHref:
      achievement.unlocked_by_session_id === null
        ? null
        : `/history/${achievement.unlocked_by_session_id}`,
  };
}
