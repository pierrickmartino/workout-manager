import type { Achievement, AchievementRecord } from "./profile-progress-types";
import type { WeightUnit } from "./weight-unit";
import { formatLongDate } from "./date-format.ts";
import { formatBodyWeight, formatLoad } from "./load.ts";
import { formatRecordAchievement } from "./record-achievement.ts";

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

// Where a Stamp page was opened from: the Passport itself, or the Profile summary. A closed
// vocabulary rather than a free path, since these are the only two places that list Stamps.
export type StampOrigin = "passport" | "profile";

const PROFILE_ORIGIN = "profile";

// Every Achievement, earned or locked, opens its own page under the Achievements route, keyed
// by its id (#652). One opened from the Profile carries that origin, so its back link can
// return there; the Passport is the page's parent and needs none.
function stampHref(id: string, origin: StampOrigin): string {
  const page = `/profile/achievements/${encodeURIComponent(id)}`;
  return origin === PROFILE_ORIGIN ? `${page}?from=${PROFILE_ORIGIN}` : page;
}

export interface StampBackLink {
  href: string;
  label: string;
}

// The Stamp page's back link, from its `?from=` query: the Profile when it was opened there,
// otherwise the Passport, its parent. Anything else is ignored, so a crafted origin can only
// ever fall back to the Passport.
export function stampBackLink(from: string | undefined): StampBackLink {
  return from === PROFILE_ORIGIN
    ? { href: "/profile", label: "BACK TO PROFILE" }
    : { href: "/profile/achievements", label: "BACK TO PASSPORT" };
}

// The earned date with the year, or null if the API sent none.
function earnedOn(achievement: Achievement): string | null {
  return achievement.unlocked_on === null ? null : formatLongDate(achievement.unlocked_on);
}

function toMilestone(achievement: Achievement, origin: StampOrigin): Milestone {
  return {
    id: achievement.id,
    name: achievement.name,
    criteria: achievement.criteria,
    progress: progressLabel(achievement),
    fill: ratio(achievement),
    href: stampHref(achievement.id, origin),
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
// order. `origin` is the page listing them, which every Stamp link carries (see `stampHref`).
// Pure and server-free, so it is safe from either a Server or Client Component.
export function toPassport(
  achievements: readonly Achievement[],
  origin: StampOrigin = "passport",
): Passport {
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
      earnedOn: earnedOn(achievement),
      href: stampHref(achievement.id, origin),
    }));
  const locked = catalog.filter(({ achievement }) => !achievement.unlocked);
  const next = closestToEarned(locked);
  const moreToEarn = locked
    .filter((entry) => entry !== next)
    .map(({ achievement }) => toMilestone(achievement, origin));
  return {
    stamps,
    empty: stamps.length === 0,
    next: next === null ? null : toMilestone(next.achievement, origin),
    moreToEarn,
  };
}

// The lift that set the First Record (#653), formatted in the reader's Weight Unit.
export interface StampLift {
  exercise: string;
  // The set: its typed Load × reps — "100 kg × 5", "bodyweight + 20 kg × 5".
  set: string;
  // The Estimated 1RM headline for an absolute lift ("117 kg"); null for a bodyweight one,
  // whose estimate only orders records within its Exercise and is never a kg headline
  // (ADR-0026).
  estimatedOneRepMax: string | null;
  // The Performed Body Weight a bodyweight lift was done at, or null when none was on file
  // and for an absolute lift.
  bodyWeight: string | null;
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
  // The lift behind First Record (#653); null for every other Achievement, and for a First
  // Record the API sent without one.
  lift: StampLift | null;
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
// reached it. That holds because the API replays sessions oldest first: each one adds one to
// the session count, and can only extend the latest run of weeks by one, so the crossing
// session lands exactly on the target rather than past it. Streaks count consecutive weeks, never a run that could be broken (ADR-0019).
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

// The lift through the shared display rules. An absolute set reads as its typed Load × reps,
// headlined by its Estimated 1RM. A bodyweight set reads through the Personal Record rule every
// other record surface uses — "bodyweight + 20 kg × 5" — so a stored "BW" or a zero added load
// never shows through, and it carries no kg headline (ADR-0026).
function toStampLift(record: AchievementRecord, unit: WeightUnit): StampLift {
  return {
    exercise: record.exercise,
    set: record.is_bodyweight
      ? formatRecordAchievement(record, unit)
      : `${formatLoad(record.load, unit)} × ${record.reps}`,
    estimatedOneRepMax: record.is_bodyweight ? null : formatRecordAchievement(record, unit),
    bodyWeight:
      record.is_bodyweight && record.body_weight_kg != null
        ? formatBodyWeight(record.body_weight_kg, unit)
        : null,
  };
}

// The Stamp page for one Achievement, read from the same profile progress the Passport is: no
// endpoint of its own. Null when the catalog holds no such id, so the page renders not-found.
// `unit` is the reader's Weight Unit, which the First Record lift is shown in.
export function toStampDetail(
  achievements: readonly Achievement[],
  id: string,
  unit: WeightUnit,
): StampDetail | null {
  const achievement = achievements.find((candidate) => candidate.id === id);
  if (achievement === undefined) {
    return null;
  }
  if (!achievement.unlocked) {
    const { href: _ownPage, ...milestone } = toMilestone(achievement, "passport");
    return { status: "locked", ...milestone };
  }
  return {
    status: "earned",
    id: achievement.id,
    name: achievement.name,
    earnedOn: earnedOn(achievement),
    explanation: explanation(achievement),
    sourceHref:
      achievement.unlocked_by_session_id === null
        ? null
        : `/history/${achievement.unlocked_by_session_id}`,
    lift: achievement.record != null ? toStampLift(achievement.record, unit) : null,
  };
}
