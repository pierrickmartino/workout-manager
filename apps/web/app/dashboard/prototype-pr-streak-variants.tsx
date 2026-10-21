// PROTOTYPE — throwaway. Question: "What should the Latest PR and the Streak look like on
// Home?" Four variants of that one block, switchable via `?variant=A|B|C|D` on the existing
// `/dashboard` route; everything else on the page is the real Home. Extra knobs for edge
// cases: `?pr=none` hides the Latest PR, `?streak=N` overrides the Streak count.
//
// Each variant picks its own slot: `top` (full width, under the header) or `rail` (the
// Operator status column, which stacks under the main column below `lg:`).

import Link from "next/link";
import * as React from "react";

import { Trophy, Zap } from "@/components/pulse/icons";
import { Bento, BentoTile } from "@/components/pulse/bento";
import { Card } from "@/components/ui/card";
import { appendFrom } from "@/lib/back-target";
import { formatShortDate } from "@/lib/date-format";
import type { LatestPrLine } from "@/lib/home-view";
import { NAV_FORWARD } from "@/lib/nav-direction";
import { cn } from "@/lib/utils";

export const PR_STREAK_VARIANTS = [
  { key: "A", name: "Current" },
  { key: "B", name: "Scoreboard" },
  { key: "C", name: "Ticker strip" },
  { key: "D", name: "Trophy feature" },
] as const;

export type PrStreakSlot = "top" | "rail";

export interface PrStreakData {
  latestPr: LatestPrLine | null;
  // ISO yyyy-mm-dd the record was set on.
  prDate: string | null;
  streak: number;
  // True when the wide Recent Records feed is on the page (the current design hides
  // its Latest PR line at `lg:` then).
  hasRecentRecords: boolean;
}

interface VariantProps extends PrStreakData {
  slot: PrStreakSlot;
}

function prHref(pr: LatestPrLine): string {
  return appendFrom(`/exercises/${pr.exerciseId}`, "/dashboard");
}

function weeksWord(streak: number): string {
  return streak === 1 ? "WEEK" : "WEEKS";
}

// Splits "142 kg est. 1RM" into a headline and a caption; a bodyweight set stays whole.
function splitEstimate(estimate: string): { headline: string; caption: string | null } {
  const suffix = " est. 1RM";
  return estimate.endsWith(suffix)
    ? { headline: estimate.slice(0, -suffix.length), caption: "EST. 1RM" }
    : { headline: estimate, caption: null };
}

// A — the design on main today, verbatim, as the baseline.
function VariantA({ slot, latestPr, streak, hasRecentRecords }: VariantProps): React.ReactNode {
  if (slot !== "rail") return null;
  return (
    <>
      {latestPr ? (
        <Link
          {...NAV_FORWARD}
          href={prHref(latestPr)}
          className={cn(
            "flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 transition-colors hover:border-cyan/40",
            hasRecentRecords && "lg:hidden",
          )}
        >
          <Trophy className="h-4 w-4 shrink-0 text-cyan" />
          <div className="flex flex-col">
            <span className="label-mono text-[10px] text-text-muted">LATEST PR</span>
            <span className="font-sans text-sm font-medium text-text-primary">
              {latestPr.text}
            </span>
          </div>
        </Link>
      ) : null}
      <Bento>
        <BentoTile label="STREAK" value={streak} caption={weeksWord(streak)} span="full" />
      </Bento>
    </>
  );
}

// B — one split card: Streak and Latest PR as two equal scoreboard halves.
function VariantB({ slot, latestPr, prDate, streak }: VariantProps): React.ReactNode {
  if (slot !== "rail") return null;
  const pips = Math.min(streak, 8);
  const estimate = latestPr ? splitEstimate(latestPr.estimate) : null;
  return (
    <Card className="grid grid-cols-2 divide-x divide-border p-0">
      <div className="flex min-w-0 flex-col gap-2 p-5">
        <span className="label-mono text-[9px] tracking-wider text-text-muted">STREAK</span>
        <span className="font-display text-4xl font-bold leading-none text-text-primary tabular-nums">
          {streak}
        </span>
        <span className="label-mono text-[9px] text-cyan">{weeksWord(streak)} IN A ROW</span>
        <div className="mt-1 flex gap-1" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              className={cn("h-1.5 w-full rounded-sm", i < pips ? "bg-cyan" : "bg-border")}
            />
          ))}
        </div>
      </div>
      {latestPr && estimate ? (
        <Link
          {...NAV_FORWARD}
          href={prHref(latestPr)}
          className="flex min-w-0 flex-col gap-2 p-5 transition-colors hover:bg-elevated"
        >
          <span className="label-mono text-[9px] tracking-wider text-text-muted">LATEST PR</span>
          <span className="font-display text-2xl font-bold leading-none text-text-primary tabular-nums">
            {estimate.headline}
          </span>
          {estimate.caption ? (
            <span className="label-mono text-[9px] text-cyan">{estimate.caption}</span>
          ) : null}
          <span className="font-sans text-sm text-text-secondary">{latestPr.exercise}</span>
          {prDate ? (
            <span className="label-mono text-[9px] text-text-muted">
              {formatShortDate(prDate).toUpperCase()}
            </span>
          ) : null}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-col gap-2 p-5">
          <span className="label-mono text-[9px] tracking-wider text-text-muted">LATEST PR</span>
          <span className="font-sans text-sm text-text-secondary">
            Log a weighted set to set your first record.
          </span>
        </div>
      )}
    </Card>
  );
}

// C — a single full-width ticker under the header: both facts read as one line, out of
// the rail entirely, so they are the first thing seen on a phone too.
function VariantC({ slot, latestPr, prDate, streak }: VariantProps): React.ReactNode {
  if (slot !== "top") return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border py-3">
      <span className="flex items-center gap-2">
        <Zap className="h-4 w-4 shrink-0 text-amber" />
        <span className="font-display text-lg font-bold text-text-primary tabular-nums">
          {streak}
        </span>
        <span className="label-mono text-[10px] text-text-muted">
          {streak === 1 ? "WEEK" : "WEEKS"} STREAK
        </span>
      </span>
      {latestPr ? (
        <Link
          {...NAV_FORWARD}
          href={prHref(latestPr)}
          className="flex min-w-0 items-center gap-2 hover:text-cyan"
        >
          <Trophy className="h-4 w-4 shrink-0 text-cyan" />
          <span className="label-mono text-[10px] text-text-muted">LATEST PR</span>
          <span className="font-sans text-sm font-medium text-text-primary">
            {latestPr.text}
          </span>
          {prDate ? (
            <span className="label-mono text-[10px] text-text-muted">
              · {formatShortDate(prDate).toUpperCase()}
            </span>
          ) : null}
        </Link>
      ) : null}
    </div>
  );
}

// D — the Latest PR as the rail’s feature: exercise as a heading, the figure huge, the
// Streak demoted to a footer bar on the same card.
function VariantD({ slot, latestPr, prDate, streak }: VariantProps): React.ReactNode {
  if (slot !== "rail") return null;
  const estimate = latestPr ? splitEstimate(latestPr.estimate) : null;
  return (
    <Card className="flex flex-col overflow-hidden p-0">
      {latestPr && estimate ? (
        <Link
          {...NAV_FORWARD}
          href={prHref(latestPr)}
          className="flex flex-col gap-3 p-6 transition-colors hover:bg-elevated"
        >
          <span className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-dim">
              <Trophy className="h-4 w-4 text-cyan" />
            </span>
            <span className="label-mono text-[10px] text-text-muted">
              LATEST PR{prDate ? ` · ${formatShortDate(prDate).toUpperCase()}` : ""}
            </span>
          </span>
          <span className="font-display text-xl font-semibold text-text-primary text-balance">
            {latestPr.exercise}
          </span>
          <span className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-bold leading-none text-cyan tabular-nums">
              {estimate.headline}
            </span>
            {estimate.caption ? (
              <span className="label-mono text-[10px] text-text-muted">{estimate.caption}</span>
            ) : null}
          </span>
        </Link>
      ) : (
        <div className="flex flex-col gap-2 p-6">
          <span className="label-mono text-[10px] text-text-muted">LATEST PR</span>
          <span className="font-sans text-sm text-text-secondary">
            No record yet. Your first weighted set sets one.
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-border bg-elevated px-6 py-3">
        <span className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber" />
          <span className="label-mono text-[10px] text-text-muted">STREAK</span>
        </span>
        <span className="font-display text-base font-bold text-text-primary tabular-nums">
          {streak} <span className="label-mono text-[10px] text-text-muted">{weeksWord(streak)}</span>
        </span>
      </div>
    </Card>
  );
}

const VARIANTS = { A: VariantA, B: VariantB, C: VariantC, D: VariantD } as const;

export function resolvePrStreakVariant(raw: string | string[] | undefined): keyof typeof VARIANTS {
  const value = typeof raw === "string" ? raw.toUpperCase() : "A";
  return Object.hasOwn(VARIANTS, value) ? (value as keyof typeof VARIANTS) : "A";
}

export function PrStreakPrototype({
  variant,
  ...props
}: VariantProps & { variant: keyof typeof VARIANTS }): React.ReactNode {
  const Variant = VARIANTS[variant];
  return <Variant {...props} />;
}
