import * as React from "react";

import type { FitnessLevelRow, FitnessLevelZone } from "@/lib/fitness-level-standing";
import { MAX_LEVEL } from "@/lib/fitness-level-standing";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";

// The Profile view's Fitness Level section (ADR-0112, #606): per Training Type, the
// **Declared Fitness Level** the user states about themselves read against the **Effective
// Fitness Level** the app actually plans with. Before this section existed only the Declared
// level was rendered, while the difficulty a Protocol is generated at and the size of a
// Calibration notch both came from the Effective one — so when the two disagreed the user was
// left to guess which number their plans came from.
//
// Each row is a **rail of ten notches**, not a pair of printed fractions. The thing a reader
// comes here for is the *gap* between the two readings, and "5/10" beside "8/10" asks them to
// subtract to find it; a rail shows it as a shape, and every row is drawn against the same
// scale so two types can be compared at a glance. The figures are not lost — they are the
// rail's accessible name, which is what a reader who gets no drawing hears instead (a
// `role="img"` carrying that name is how a graphic is named, rather than a row of unlabelled
// boxes announced one at a time).
//
// Presentational only: `toFitnessLevelRows` in `lib/fitness-level-standing` owns which notch
// belongs to which zone and every word of the per-row copy, so this renders one array and
// cannot disagree with its source. Every row renders, including when the two readings are
// equal: "we read your record and found no change" is not the same message as a blank, and an
// all-neutral rail with its sentence says exactly that.
//
// Sits beside the Operator Level badge on purpose — the account-wide investment number and the
// per-type ability readings are the one pair a reader is most likely to confuse (CONTEXT:
// Operator Level), so they are legible next to each other rather than on separate screens.
interface FitnessLevelStandingsProps {
  // One row per declared Training Type, already ordered, zoned and worded by
  // `toFitnessLevelRows`.
  rows: FitnessLevelRow[];
}

// Each zone's fill. All three are solid declared tokens and none of them carries text: the
// rail's facts reach every reader through its accessible name, so these are graphical objects
// rather than a surface anything is printed on (ADR-0081/0086).
const ZONE_FILL: Record<FitnessLevelZone, string> = {
  declared: "bg-text-muted",
  earned: "bg-cyan",
  empty: "bg-elevated",
};

// The key, and the scale the notches are counted on. Rendered once above the rows rather than
// per row: five copies of the same two words is noise, and a rail means nothing until the
// reader has been told what its two fills are.
function RailKey(): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-4 shrink-0 rounded-[1px] bg-text-muted" aria-hidden />
        <span className="label-mono text-[9px] text-text-muted">DECLARED</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-4 shrink-0 rounded-[1px] bg-cyan" aria-hidden />
        <span className="label-mono text-[9px] text-text-muted">EARNED</span>
      </span>
      <span className="label-mono text-[9px] text-text-muted">
        SCALE 1–{MAX_LEVEL}
      </span>
    </div>
  );
}

// One Training Type's two readings, drawn. Named as a whole (`role="img"` plus the row's
// readout) rather than notch by notch: ten separately-announced boxes is not a reading.
function Rail({ row }: { row: FitnessLevelRow }): React.JSX.Element {
  return (
    <div
      className="flex items-center gap-[3px]"
      role="img"
      aria-label={row.readout}
    >
      {row.zones.map((zone, index) => (
        <span
          key={index}
          className={cn(
            "h-2.5 flex-1 rounded-[1px]",
            ZONE_FILL[zone],
            // The hand-off point carries a ring, so where the user's own declaration stops
            // and the app's reading starts stays visible even when the earned zone is a
            // single notch wide — and so the boundary is not carried by colour alone.
            zone === "earned" && row.zones[index - 1] !== "earned"
              ? "ring-1 ring-cyan"
              : null,
          )}
        />
      ))}
    </div>
  );
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
        <RailKey />
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {rows.map((row) => (
            <li
              key={row.trainingType}
              className="flex flex-col gap-2 py-3.5 last:pb-0"
            >
              {/* The row's own heading, one rank below the section divider (ADR-0094), so a
                  reader skimming the outline hears each Training Type rather than one
                  undifferentiated section. The rail below it is content-free and every notch
                  is `flex-1`, so the row shrinks to any viewport instead of overflowing it,
                  and an authored name wraps rather than widening the document
                  (ADR-0085/0087). */}
              <h3 className="label-mono min-w-0 break-words text-[11px] text-text-secondary">
                {row.trainingType}
              </h3>
              <Rail row={row} />
              <p className="text-xs text-text-secondary">{row.note}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
