import type { Achievement } from "./profile-progress-types";

// An Achievement prepared for the Profile wall: the badge's copy, whether it is unlocked,
// a single `progress` string (the short earned date once unlocked, else a live
// "current/target" ratio), and a clamped 0–1 `fill` for its meter.
export interface AchievementCard {
  id: string;
  name: string;
  criteria: string;
  unlocked: boolean;
  progress: string;
  fill: number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Format an ISO `yyyy-mm-dd` date as a short "Mon D" label. Parsed from the string parts
// so it is timezone-safe — never shifted a day by a Date constructor's local offset — and
// deterministic across environments. Mirrors `records-view.ts`.
function formatEarnedDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

// Turn the API's evaluated Achievements into display cards, preserving the curated catalog
// order the API returns. An unlocked badge reads its earned date and a full meter; a locked
// badge reads live "current/target" progress and a fractional fill. Pure and server-free,
// so it is safe from either a Server or Client Component.
export function toAchievementCards(
  achievements: readonly Achievement[],
): AchievementCard[] {
  return achievements.map((achievement) => {
    const unlocked = achievement.unlocked;
    // Guard the divide (a curated target is always positive, but never trust it to) and
    // clamp so an overshooting count never overfills the meter.
    const ratio =
      achievement.target > 0
        ? Math.min(1, achievement.current / achievement.target)
        : 0;
    return {
      id: achievement.id,
      name: achievement.name,
      criteria: achievement.criteria,
      unlocked,
      progress:
        unlocked && achievement.unlocked_on !== null
          ? formatEarnedDate(achievement.unlocked_on)
          : `${achievement.current}/${achievement.target}`,
      fill: unlocked ? 1 : ratio,
    };
  });
}
