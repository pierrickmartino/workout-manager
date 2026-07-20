import { cn } from "@/lib/utils";
import type {
  MuscleBalanceView,
  MuscleBalanceWeek,
} from "@/lib/muscle-balance-view";
import { GROUP_COLOR, GROUP_COLOR_FALLBACK } from "@/components/pulse/muscle-colors";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";

interface MuscleBalanceProps {
  view: MuscleBalanceView;
}

// The Muscle-Group balance-over-time section (issue #178 / ADR-0024): one stacked bar
// per week showing how the user's set-count split across the curated Muscle Groups has
// drifted. It is **descriptive only** — it shows the drift, it never flags or nudges an
// under-trained bucket. Weekly, not daily (ADR-0001, calendar-free): a daily quota reading
// has no place in a self-paced model. Every week the window spans is drawn, including
// untrained ones as honest empty tracks, so the axis never hides a gap. Accessibility: a
// group legend and per-bar labels carry the data so nothing rides on color alone, and each
// bar's segments are hidden from screen readers behind one composed `aria-label`. A thin
// renderer — all shaping lives in the `muscle-balance-view` view-model.
export function MuscleBalance({ view }: MuscleBalanceProps) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader meta={`${view.weeks.length}w`}>MUSCLE BALANCE</SectionHeader>
      {view.isEmpty ? (
        <Card className="p-6">
          <p className="font-sans text-sm text-text-secondary">
            No training logged in the last {view.weeks.length} weeks. Log a few
            sessions and your Muscle Group balance will build here, week by week.
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-5 p-5">
          <Legend groups={presentGroups(view)} />
          <div className="flex flex-col gap-3">
            {view.weeks.map((week) => (
              <WeekBar key={week.week} week={week} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// The groups that actually received training across the window, in the canonical order
// the view already carries (first appearance follows the server's GROUP_ORDER). Only
// trained groups are legended, so the key stays honest about what the user did.
function presentGroups(view: MuscleBalanceView): string[] {
  const seen: string[] = [];
  for (const week of view.weeks) {
    for (const segment of week.segments) {
      if (!seen.includes(segment.group)) {
        seen.push(segment.group);
      }
    }
  }
  return seen;
}

function Legend({ groups }: { groups: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Muscle Group colors">
      {groups.map((group) => (
        <li key={group} className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-[2px]",
              GROUP_COLOR[group] ?? GROUP_COLOR_FALLBACK,
            )}
            aria-hidden
          />
          <span className="label-mono text-[11px] text-text-secondary">{group}</span>
        </li>
      ))}
    </ul>
  );
}

// One week's row: a short visible week label (hidden from screen readers, which get the
// week from the bar's composed label instead) and the stacked bar itself. An untrained
// week renders as an empty track — still present, never dropped — labelled honestly.
function WeekBar({ week }: { week: MuscleBalanceWeek }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="w-12 shrink-0 label-mono text-[11px] text-text-muted tabular-nums"
        aria-hidden
      >
        {week.weekLabel}
      </span>
      <div
        role="img"
        aria-label={week.ariaLabel}
        className="flex h-3 w-full overflow-hidden rounded-[3px] bg-elevated"
      >
        {week.segments.map((segment, index) => (
          <span
            key={`${segment.group}-${index}`}
            className={cn(
              "block h-full",
              GROUP_COLOR[segment.group] ?? GROUP_COLOR_FALLBACK,
            )}
            style={{ width: `${segment.width}%` }}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
