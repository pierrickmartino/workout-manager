import { cn } from "@/lib/utils";
import type { MuscleBar } from "@/lib/muscle-distribution";

// A stable, curated color per Muscle Group so the split reads consistently across the
// app — the Analytics screen and the Builder's SIMULATE preview share this palette.
// Unclassified is deliberately muted — it is the honest "leftovers" bucket, shown but
// never competing with a real group for the eye.
const GROUP_COLOR: Record<string, string> = {
  Legs: "bg-cyan",
  Chest: "bg-violet",
  Back: "bg-blue",
  Shoulders: "bg-magenta",
  Arms: "bg-cyan",
  Core: "bg-violet",
  Unclassified: "bg-text-muted",
};

interface MuscleSplitProps {
  bars: MuscleBar[];
  // Shown when there is no muscle data — the honest empty state, phrased for the
  // caller's context (a logging window vs. an unbuilt draft).
  emptyMessage: string;
}

// The set-count Muscle-Group distribution as a stack of labeled horizontal bars in the
// operator theme (F3 Slice 2). Each group's fill width is its exact share, so the bars
// stay proportional even as the labels round. Weighted purely by set count — no Load,
// no Estimated 1RM — so no single heavy lift can dominate the split. The caller owns
// the surrounding Card/heading; this renders just the bars (or the empty state).
export function MuscleSplit({ bars, emptyMessage }: MuscleSplitProps) {
  if (bars.length === 0) {
    return (
      <p className="font-sans text-sm text-text-secondary">{emptyMessage}</p>
    );
  }

  return (
    <>
      {bars.map((bar) => (
        <div key={bar.group} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="label-mono text-[11px] text-text-secondary">
              {bar.group}
            </span>
            <span className="font-display text-sm font-semibold text-text-primary tabular-nums">
              {bar.label}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-[2px] bg-elevated">
            <span
              className={cn(
                "block h-full rounded-[2px]",
                GROUP_COLOR[bar.group] ?? "bg-cyan",
              )}
              style={{ width: `${bar.width}%` }}
            />
          </div>
        </div>
      ))}
    </>
  );
}
