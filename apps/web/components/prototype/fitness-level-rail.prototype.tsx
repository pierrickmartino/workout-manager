import * as React from "react";

import type { FitnessLevelVisualRow } from "@/lib/fitness-level-visual.prototype";
import { MAX_LEVEL } from "@/lib/fitness-level-visual.prototype";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";

// PROTOTYPE — THROWAWAY. Variant A: "Two-zone rail".
//
// The shipped section’s shape (a list, one row per Training Type) with the two numbers replaced
// by **one rail of ten notches**: the notches up to the Declared level are neutral, the notches
// the recent record earned on top of it are accent, and the rest of the scale is empty. The bet
// is that "declared, plus what you earned, out of ten" is one continuous object rather than two
// numbers a reader has to subtract — the figure is the *gap*, and a gap is a shape.
//
// Keeps: the list, the per-row sentence, the row heading rank (ADR-0094).
// Drops: both numerals from the visual read — they survive as the row’s accessible readout.

// One notch. `kind` is the zone it belongs to, and nothing here carries text (the rail’s facts
// reach a non-visual reader through the row’s readout), so these are graphical objects.
const ZONE_FILL: Record<"declared" | "earned" | "empty", string> = {
  declared: "bg-text-muted",
  earned: "bg-cyan",
  empty: "bg-elevated",
};

function zoneOf(
  notch: number,
  row: FitnessLevelVisualRow,
): "declared" | "earned" | "empty" {
  if (notch <= row.declared) return "declared";
  if (notch <= row.declared + row.earned) return "earned";
  return "empty";
}

function Legend(): React.JSX.Element {
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
    </div>
  );
}

export function FitnessLevelRail({
  rows,
}: {
  rows: FitnessLevelVisualRow[];
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>FITNESS LEVEL</SectionHeader>
      <Card className="flex flex-col gap-4 p-5">
        <p className="text-sm text-text-secondary">
          Your plans are generated at the Effective Fitness Level: what you declared, plus
          what your recent record shows. It is never read below what you declared.
        </p>
        <Legend />
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {rows.map((row) => (
            <li
              key={row.trainingType}
              className="flex flex-col gap-2 py-3.5 last:pb-0"
            >
              <h3 className="label-mono min-w-0 break-words text-[11px] text-text-secondary">
                {row.trainingType}
              </h3>
              {/* The rail. Ten content-free notches, so it shrinks to any viewport without
                  a track to overflow (ADR-0085/0087). */}
              <div className="flex items-center gap-[3px]" aria-hidden>
                {Array.from({ length: MAX_LEVEL }, (_, index) => {
                  const notch = index + 1;
                  const zone = zoneOf(notch, row);
                  return (
                    <span
                      key={notch}
                      className={cn(
                        "h-2.5 flex-1 rounded-[1px]",
                        ZONE_FILL[zone],
                        // The hand-off point gets a hairline so the reader can see where
                        // their own declaration stops and the app’s reading starts, even
                        // when the earned zone is a single notch wide.
                        zone === "earned" && notch === row.declared + 1
                          ? "ring-1 ring-cyan"
                          : null,
                      )}
                    />
                  );
                })}
              </div>
              <span className="sr-only">{row.readout}</span>
              <p className="text-xs text-text-secondary">{row.note}</p>
            </li>
          ))}
        </ul>
        <p className="label-mono text-[9px] text-text-muted">
          SCALE 1 — {MAX_LEVEL}
        </p>
      </Card>
    </div>
  );
}
