"use client";

// PROTOTYPE — throwaway. Three structurally different editorial layouts for the
// "progress as a short, verifiable story" surface (screens 07–08), switchable via the
// floating bottom bar (?variant=). A pill row up top switches the exercise/story
// (?story=) so every load dimension — added weight, barbell, assisted, bodyweight
// reps, timed hold — and the honest incomparable case can be walked through. See
// ./README.md. NOT production: no tests, stub data, minimal abstraction.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

import { useChartTheme } from "@/lib/use-chart-theme";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Overline } from "@/components/pulse/overline";
import { cn } from "@/lib/utils";

import {
  PROGRESS_STORIES,
  resolveStory,
  type ProgressStory,
  type StoryPerformance,
} from "./progress-story-data";
import { PrototypeSwitcher } from "./prototype-switcher";

const VARIANTS = ["A", "B", "C"] as const;
const VARIANT_LABELS: Record<string, string> = {
  A: "Headline & Ledger",
  B: "Split Accent",
  C: "Inline Strip",
};

export function ProgressStoryPrototype({
  variant,
  storyKey,
}: {
  variant: string;
  storyKey: string | undefined;
}) {
  const story = resolveStory(storyKey);
  const active = VARIANTS.includes(variant as (typeof VARIANTS)[number])
    ? variant
    : "A";

  return (
    <div className="flex flex-col gap-6">
      <StorySelector current={story.key} />
      {active === "A" && <VariantA story={story} />}
      {active === "B" && <VariantB story={story} />}
      {active === "C" && <VariantC story={story} />}
      <PrototypeSwitcher
        variants={VARIANTS}
        labels={VARIANT_LABELS}
        current={active}
      />
    </div>
  );
}

// Exercise/story picker — sets ?story= while preserving ?variant=.
function StorySelector({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("story", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {PROGRESS_STORIES.map((story) => (
        <button
          key={story.key}
          type="button"
          onClick={() => select(story.key)}
          aria-current={story.key === current ? "true" : undefined}
          className={cn(
            "label-mono rounded-sm border px-2.5 py-1 text-[11px] font-medium transition-colors",
            story.key === current
              ? "border-cyan/40 bg-cyan/15 text-cyan"
              : "border-border text-text-muted hover:text-text-secondary",
          )}
        >
          {story.exercise}
        </button>
      ))}
    </div>
  );
}

// ── Variant A — Headline & Ledger ──────────────────────────────────────────────
// Magazine treatment: a kicker, a big editorial headline carrying the claim, a
// restrained cyan accent line, then a THEN→NOW ledger and a compact bar chart.
function VariantA({ story }: { story: ProgressStory }) {
  return (
    <Card className="flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-3">
        <Overline>
          VERIFIED PROGRESS · {story.exercise} · {story.rangeLabel}
        </Overline>
        {story.headline ? (
          <h2 className="max-w-[22ch] font-display text-3xl font-bold leading-[1.1] tracking-tight text-text-primary sm:text-4xl">
            {story.headline}
          </h2>
        ) : (
          <IncomparableHeadline story={story} />
        )}
        <span className="h-0.5 w-16 rounded-full bg-cyan" aria-hidden />
      </div>

      {/* Stacks THEN → NOW vertically on phones (the 3-across grid is too tight under
          ~400px); side-by-side with the delta between them from sm up. */}
      <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <LedgerCell label="THEN" perf={story.earlier} tone="muted" />
        <div className="flex items-center justify-center px-1">
          {story.headline ? (
            <Badge variant="cyan" className="whitespace-nowrap">
              {story.delta}
            </Badge>
          ) : (
            <span className="label-mono text-[11px] text-text-muted">vs</span>
          )}
        </div>
        <LedgerCell label="NOW" perf={story.later} tone="lead" />
      </div>

      {story.incomparable ? <IncomparableNote story={story} /> : null}

      <div className="flex flex-col gap-2">
        <StoryBarChart story={story} />
        <p className="label-mono text-[11px] text-text-muted">
          Each bar is one comparable session · measured in {story.unit}
        </p>
      </div>

      <SourceLinks story={story} />
    </Card>
  );
}

function LedgerCell({
  label,
  perf,
  tone,
}: {
  label: string;
  perf: StoryPerformance;
  tone: "muted" | "lead";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-base/40 p-4">
      <span className="label-mono text-[10px] tracking-wider text-text-muted">
        {label} · {perf.dateLabel}
      </span>
      <span
        className={cn(
          "font-display text-2xl font-semibold tabular-nums",
          tone === "lead" ? "text-cyan" : "text-text-primary",
        )}
      >
        {perf.movedLabel}
      </span>
      <span className="label-mono text-[11px] text-text-muted">
        {perf.anchorLabel}
      </span>
    </div>
  );
}

// ── Variant B — Split Accent ───────────────────────────────────────────────────
// A vertical cyan accent rail carries the claim on the left; the chart is the hero on
// the right, with the two compared sessions labelled inline beneath it. Chart-forward
// hierarchy — the opposite emphasis from A.
function VariantB({ story }: { story: ProgressStory }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-0 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex items-stretch gap-4 border-b border-border p-6 sm:p-8 md:border-b-0 md:border-r">
          <span
            className="w-1 shrink-0 rounded-full bg-cyan"
            aria-hidden
          />
          <div className="flex flex-col gap-3">
            <Overline>{story.rangeLabel}</Overline>
            <p className="font-display text-lg font-semibold text-text-primary">
              {story.exercise}
            </p>
            {story.headline ? (
              <h2 className="font-display text-2xl font-bold leading-tight tracking-tight text-text-primary sm:text-3xl">
                {story.headline}
              </h2>
            ) : (
              <IncomparableHeadline story={story} />
            )}
            {story.headline ? (
              <Badge variant="cyan" className="w-fit">
                {story.delta}
              </Badge>
            ) : null}
            {story.incomparable ? <IncomparableNote story={story} /> : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 p-6 sm:p-8">
          <StoryLineChart story={story} heightClass="h-44" />
          <div className="flex items-center justify-between gap-3">
            <AnnotatedPoint perf={story.earlier} tone="muted" unit={story.unit} />
            <span className="label-mono text-[11px] text-text-muted" aria-hidden>
              →
            </span>
            <AnnotatedPoint perf={story.later} tone="lead" unit={story.unit} />
          </div>
          <SourceLinks story={story} />
        </div>
      </div>
    </Card>
  );
}

function AnnotatedPoint({
  perf,
  tone,
  unit,
}: {
  perf: StoryPerformance;
  tone: "muted" | "lead";
  unit: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="label-mono text-[10px] text-text-muted">
        {perf.dateLabel}
      </span>
      <span
        className={cn(
          "font-display text-lg font-semibold tabular-nums",
          tone === "lead" ? "text-cyan" : "text-text-primary",
        )}
      >
        {perf.movedLabel}
      </span>
      <span className="label-mono text-[10px] text-text-muted">
        {perf.anchorLabel} · {unit}
      </span>
    </div>
  );
}

// ── Variant C — Inline Strip ─────────────────────────────────────────────────────
// The most restrained: a single compact strip that reads like an upgraded trajectory
// tile. Claim + delta chip on one line, an "A → B" inline comparison, and a minimal
// axis-free sparkline. Designed to slot into the existing small-multiple rhythm.
function VariantC({ story }: { story: ProgressStory }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="label-mono text-[11px] text-text-muted">
            {story.exercise} · {story.rangeLabel}
          </span>
          {story.headline ? (
            <p className="font-display text-lg font-semibold leading-snug text-text-primary">
              {story.headline}
            </p>
          ) : (
            <p className="font-display text-lg font-semibold leading-snug text-text-secondary">
              No clean comparison yet
            </p>
          )}
        </div>
        {story.headline ? (
          <Badge variant="cyan" className="shrink-0 whitespace-nowrap">
            {story.delta}
          </Badge>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <InlinePerf perf={story.earlier} tone="muted" />
          <span className="label-mono shrink-0 text-text-muted" aria-hidden>
            →
          </span>
          <InlinePerf perf={story.later} tone="lead" />
        </div>
        <div className="w-28 shrink-0">
          <StorySparkline story={story} />
        </div>
      </div>

      {story.incomparable ? <IncomparableNote story={story} /> : null}

      <SourceLinks story={story} compact />
    </Card>
  );
}

function InlinePerf({
  perf,
  tone,
}: {
  perf: StoryPerformance;
  tone: "muted" | "lead";
}) {
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          "font-display text-base font-semibold tabular-nums",
          tone === "lead" ? "text-cyan" : "text-text-primary",
        )}
      >
        {perf.movedLabel}
      </span>
      <span className="label-mono text-[10px] text-text-muted">
        {perf.anchorLabel}
      </span>
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────────

function IncomparableHeadline({ story }: { story: ProgressStory }) {
  return (
    <h2 className="max-w-[24ch] font-display text-2xl font-bold leading-tight tracking-tight text-text-secondary sm:text-3xl">
      {story.exercise}: no same-effort comparison yet.
    </h2>
  );
}

function IncomparableNote({ story }: { story: ProgressStory }) {
  if (!story.incomparable) {
    return null;
  }
  return (
    <p className="rounded-md border border-border bg-base/40 p-3 font-sans text-sm text-text-secondary">
      {story.incomparable.reason}
    </p>
  );
}

// "Inspect the source sessions" — the two Logged Sessions behind the comparison.
function SourceLinks({
  story,
  compact = false,
}: {
  story: ProgressStory;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1",
        compact ? "pt-0" : "border-t border-border pt-3",
      )}
    >
      <span className="label-mono text-[10px] uppercase tracking-wider text-text-muted">
        Inspect
      </span>
      <SourceLink perf={story.earlier} label="earlier session" />
      <SourceLink perf={story.later} label="later session" />
    </div>
  );
}

function SourceLink({
  perf,
  label,
}: {
  perf: StoryPerformance;
  label: string;
}) {
  return (
    <Link
      href={`/sessions/${perf.sessionId}`}
      className="label-mono text-[11px] text-cyan hover:underline"
    >
      {label} ({perf.dateLabel}) →
    </Link>
  );
}

// ── Charts (Recharts 2.15.4, themed via useChartTheme like the real charts) ───────

// A compact bar chart — one bar per comparable session, the later one in lead cyan,
// the earlier in the translucent dim, context sessions muted. Mirrors the existing
// Top-Set trend chart so the surface reads as one system.
function StoryBarChart({ story }: { story: ProgressStory }) {
  const { cyan, cyanDim, muted, border } = useChartTheme();
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={story.series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <XAxis
            dataKey="dateLabel"
            tick={{ fill: muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: border }}
            minTickGap={8}
          />
          <YAxis
            tick={{ fill: muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(value: number) => `${value}`}
          />
          <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {story.series.map((point) => (
              <Cell
                key={point.dateLabel}
                fill={point.kind === "later" ? cyan : cyanDim}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// A line chart with the comparison endpoints emphasised — earlier/later points drawn
// as solid dots, context points small. The hero chart in Variant B.
function StoryLineChart({
  story,
  heightClass = "h-40",
}: {
  story: ProgressStory;
  heightClass?: string;
}) {
  const { cyan, muted, border } = useChartTheme();
  return (
    <div className={cn(heightClass, "w-full")}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={story.series} margin={{ top: 12, right: 12, bottom: 0, left: -16 }}>
          <XAxis
            dataKey="dateLabel"
            tick={{ fill: muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: border }}
            minTickGap={8}
          />
          <YAxis
            tick={{ fill: muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            domain={["dataMin - 5", "dataMax + 5"]}
            tickFormatter={(value: number) => `${Math.round(value)}`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={cyan}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props) => {
              const point = story.series[props.index];
              const emphasised = point.kind !== "context";
              return (
                <circle
                  key={point.dateLabel}
                  cx={props.cx}
                  cy={props.cy}
                  r={emphasised ? 5 : 2.5}
                  fill={emphasised ? cyan : border}
                  stroke={cyan}
                  strokeWidth={emphasised ? 0 : 1}
                />
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// A minimal axis-free sparkline for the compact strip (Variant C).
function StorySparkline({ story }: { story: ProgressStory }) {
  const { cyan } = useChartTheme();
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={story.series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={cyan}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props) => {
              const point = story.series[props.index];
              if (point.kind === "context") {
                return <g key={point.dateLabel} />;
              }
              return (
                <circle
                  key={point.dateLabel}
                  cx={props.cx}
                  cy={props.cy}
                  r={3}
                  fill={cyan}
                />
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
