import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CoverageRow, CoverageView } from "@/lib/muscle-coverage-view";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";

interface MuscleCoverageProps {
  view: CoverageView;
}

// The Muscle Group Coverage section (issue #188 / ADR-0025): a neutral, ungated checklist
// naming, for each of the six real Muscle Groups, whether it has been trained over a fixed,
// labeled 8-week window — read straight from Logged Sets. It is **descriptive only**: it
// says what has and hasn't appeared and never flags, ranks, or prescribes an "under-trained"
// group. The window is deliberately fixed at "last 8 weeks" and does **not** follow the
// screen's range toggle, so a well-rotated self-paced user is never rebuked at the week
// scale (ADR-0001/0025). Accessibility: each row carries icon **and** text (never color
// alone) and one composed `aria-label`, so the state is legible to a screen reader. A user
// with no recent training sees a single teaching empty state, never six "not trained" rows.
// A thin renderer — all shaping lives in the `muscle-coverage-view` view-model.
export function MuscleCoverage({ view }: MuscleCoverageProps) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader meta={view.weeksLabel}>MUSCLE COVERAGE</SectionHeader>
      {view.isEmpty ? (
        <Card className="p-6">
          <p className="font-sans text-sm text-text-secondary">
            No training logged in the {view.weeksLabel} yet. Log a few sessions and
            each Muscle Group you train will check off here.
          </p>
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
          {view.rows.map((row) => (
            <CoverageRowItem key={row.group} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

// One group's row: a state icon in a tinted chip, the group label, and the state as text —
// the icon and text together so nothing rides on color. The whole row is a single `img` with
// the composed accessible label (its decorative children hidden), mirroring the Muscle Balance
// bars, so a screen reader reads "Legs: trained in the last 8 weeks" once, not the pieces.
function CoverageRowItem({ row }: { row: CoverageRow }) {
  const Icon = row.covered ? Check : Minus;
  return (
    <li
      role="img"
      aria-label={row.ariaLabel}
      className="flex items-center gap-3.5 px-4 py-3.5"
    >
      <span
        aria-hidden
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-sm",
          row.covered
            ? "bg-cyan-dim text-cyan"
            : "bg-elevated text-text-muted",
        )}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span
        aria-hidden
        className="flex-1 font-sans text-[15px] font-medium text-text-primary"
      >
        {row.group}
      </span>
      <span
        aria-hidden
        className={cn(
          "label-mono text-[11px] font-semibold",
          row.covered ? "text-cyan" : "text-text-muted",
        )}
      >
        {row.stateLabel}
      </span>
    </li>
  );
}
