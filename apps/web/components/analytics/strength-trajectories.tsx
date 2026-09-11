import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { StrengthTrajectoryTile } from "@/lib/strength-trajectories-view";
import type { WeightUnit } from "@/lib/weight-unit";
import { SectionHeader } from "@/components/pulse/section-header";
import { TopSetTrendChart } from "@/components/exercise/top-set-trend-chart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StrengthTrajectoriesProps {
  tiles: StrengthTrajectoryTile[];
  // The reader's Weight Unit, forwarded to each tile's Top-Set chart tooltip (#417).
  unit: WeightUnit;
}

// The ranked strength small-multiples (issue #177 / ADR-0024): the user's top qualifying
// lifts by recent training frequency, each a compact Top-Set trend that taps through to
// the canonical full chart on Exercise Detail. It is a teaser, not a second chart — the
// bars come from the same `toTopSetTrend` transform the full chart uses. The whole section
// hides when there are no qualifying lifts (the view-model returns no tiles), so a
// bodyweight-only user never meets an empty grid. A thin renderer: all shaping, the
// headline estimate, and the accessible label live in `strength-trajectories-view`.
export function StrengthTrajectories({ tiles, unit }: StrengthTrajectoriesProps) {
  if (tiles.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader meta={`${tiles.length}`}>
        STRENGTH TRAJECTORIES
      </SectionHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tiles.map((tile) => (
          <TrajectoryTile key={tile.exerciseId} tile={tile} unit={unit} />
        ))}
      </div>
    </div>
  );
}

// One small-multiple: a single focusable link to the Exercise's full chart, labelled for
// screen readers (the bar chart itself is decorative and hidden from them). The visible
// focus ring keeps keyboard navigation legible against the dark surface.
function TrajectoryTile({
  tile,
  unit,
}: {
  tile: StrengthTrajectoryTile;
  unit: WeightUnit;
}) {
  return (
    <Link
      href={tile.href}
      aria-label={tile.ariaLabel}
      className="group rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <Card className="flex h-full flex-col gap-3 p-4 transition-colors group-hover:border-cyan/40">
        <div className="flex items-center justify-between gap-2">
          <span className="font-sans text-[15px] font-medium text-text-primary">
            {tile.exercise}
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-lg font-semibold text-text-primary tabular-nums">
            {tile.estimate}
          </span>
          {tile.trend.delta ? (
            <Badge variant="cyan">{tile.trend.delta}</Badge>
          ) : null}
        </div>
        <div aria-hidden>
          <TopSetTrendChart rows={tile.trend.rows} unit={unit} heightClass="h-28" />
        </div>
      </Card>
    </Link>
  );
}
