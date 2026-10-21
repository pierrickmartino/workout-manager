import Link from "next/link";
import * as React from "react";

import { Card } from "@/components/ui/card";
import type { LatestPrLine } from "@/lib/home-view";
import { NAV_FORWARD } from "@/lib/nav-direction";
import { cn } from "@/lib/utils";

interface OperatorScoreboardProps {
  // The weekly Streak count and its view-model caption and pips (ADR-0019).
  streak: number;
  streakCaption: string;
  streakPips: readonly boolean[];
  // The user's most recent Personal Record, or null when they have none yet.
  latestPr: LatestPrLine | null;
  // Where the Latest PR half links: its Exercise, carrying the back target.
  latestPrHref: string | null;
}

const HALF = "flex min-w-0 flex-col gap-2 bg-surface p-5";
const LABEL = "label-mono text-[9px] tracking-wider text-text-muted";

// Home's Streak and Latest PR as one split card: two equal scoreboard halves, each a big
// display figure over a mono caption. Both are read-time projections of the record
// (ADR-0018/0019, ADR-0010); nothing here is an action beyond the link to the Exercise.
// With no Personal Record yet the right half says where one will appear rather than
// vanishing or showing "0 kg", so the card keeps its shape for a brand-new account.
//
// Side by side where the card is at least 16rem wide; below that the halves stack. A `rem`
// threshold scales with the text (ADR-0087), so a 320px phone at 200% text stacks rather than
// breaking "142 kg" a letter per line. The divider is the 1px gap showing the grid's own
// fill, so it follows the halves whichever way they sit (the Calibration control's device).
export function OperatorScoreboard({
  streak,
  streakCaption,
  streakPips,
  latestPr,
  latestPrHref,
}: OperatorScoreboardProps): React.JSX.Element {
  return (
    <Card className="@container overflow-hidden p-0">
      <div className="grid grid-cols-1 gap-px bg-border @min-[16rem]:grid-cols-2">
        <div className={HALF}>
          <span className={LABEL}>STREAK</span>
          <span className="font-display text-4xl font-bold leading-none text-text-primary tabular-nums">
            {streak}
          </span>
          <span className="label-mono text-[9px] text-cyan">{streakCaption}</span>
          <div className="mt-1 flex gap-1" aria-hidden="true">
            {streakPips.map((filled, index) => (
              <span
                key={index}
                className={cn("h-1.5 w-full rounded-sm", filled ? "bg-cyan" : "bg-border")}
              />
            ))}
          </div>
        </div>
        {latestPr && latestPrHref ? (
          <Link {...NAV_FORWARD} href={latestPrHref} className={cn(HALF, "group")}>
            <span className={LABEL}>LATEST PR</span>
            <span className="break-words font-display text-2xl font-bold leading-none text-text-primary tabular-nums">
              {latestPr.headline}
            </span>
            {latestPr.headlineCaption ? (
              <span className="label-mono text-[9px] text-cyan">
                {latestPr.headlineCaption}
              </span>
            ) : null}
            <span className="break-words font-sans text-sm text-text-secondary transition-colors group-hover:text-cyan">
              {latestPr.exercise}
            </span>
            <span className="label-mono text-[9px] text-text-muted">{latestPr.dateLabel}</span>
          </Link>
        ) : (
          <div className={HALF}>
            <span className={LABEL}>LATEST PR</span>
            <span className="font-sans text-sm text-text-secondary">
              Your first record shows here.
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
