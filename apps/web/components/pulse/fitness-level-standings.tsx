import * as React from "react";

import type { FitnessLevelRow } from "@/lib/fitness-level-standing";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";

// The Profile view's Fitness Level section (ADR-0112, #606): per Training Type, the
// **Declared Fitness Level** the user states about themselves read against the **Effective
// Fitness Level** the app actually plans with. Until now only the Declared level was rendered,
// while the difficulty a Protocol is generated at and the size of a Calibration notch both
// came from the Effective one — so when the two disagreed the user was left to guess which
// number their plans came from.
//
// Presentational only: `toFitnessLevelRows` in `lib/fitness-level-standing` owns the ordering
// and every word of the per-row copy, so this renders one array and cannot disagree with its
// source. Both figures are always rendered, including when they are equal: "we read your
// record and found no change" is not the same message as a blank.
//
// Sits beside the Operator Level badge on purpose — the account-wide investment number and the
// per-type ability numbers are the one pair a reader is most likely to confuse (CONTEXT:
// Operator Level), so they are legible next to each other rather than on separate screens.
interface FitnessLevelStandingsProps {
  // One row per declared Training Type, already ordered and worded by
  // `toFitnessLevelRows`.
  rows: FitnessLevelRow[];
}

export function FitnessLevelStandings({
  rows,
}: FitnessLevelStandingsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>FITNESS LEVEL</SectionHeader>
      <Card className="flex flex-col gap-4 p-5">
        <p className="text-sm text-text-secondary">
          Your plans are generated at the Effective Fitness Level: what you declared, plus
          what your recent record shows. It is never read below what you declared.
        </p>
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {rows.map((row) => (
            <li
              key={row.trainingType}
              className="flex flex-col gap-2 py-3.5 last:pb-0"
            >
              {/* The row's own heading, one rank below the section divider (ADR-0094), so a
                  reader skimming the outline hears each Training Type rather than one
                  undifferentiated section. Both clusters wrap rather than overflow: every
                  track here is content-sized and the row stacks once the asks no longer fit,
                  which is what keeps a 320px viewport whole at 200% text (ADR-0085/0087). */}
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <h3 className="label-mono min-w-0 break-words text-[11px] text-text-secondary">
                  {row.trainingType}
                </h3>
                <dl className="flex flex-wrap items-end gap-x-4 gap-y-1">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <dt className="label-mono text-[9px] text-text-muted">
                      Declared
                    </dt>
                    <dd className="font-display text-xl font-semibold leading-none tabular-nums text-text-primary">
                      {row.declaredText}
                    </dd>
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {/* Accented only when the app is planning above the declared level —
                        the case the section exists to make visible. The equal case stays in
                        the primary rung rather than going quiet, because it is a reading,
                        not an absence. */}
                    <dt
                      className={cn(
                        "label-mono text-[9px]",
                        row.raised ? "text-cyan" : "text-text-muted",
                      )}
                    >
                      Effective
                    </dt>
                    <dd
                      className={cn(
                        "font-display text-xl font-semibold leading-none tabular-nums",
                        row.raised ? "text-cyan" : "text-text-primary",
                      )}
                    >
                      {row.effectiveText}
                    </dd>
                  </div>
                </dl>
              </div>
              <p className="text-xs text-text-secondary">{row.note}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
