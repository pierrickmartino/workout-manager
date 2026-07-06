import Link from "next/link";
import { History, LineChart, Trophy } from "lucide-react";

import {
  ANALYTICS_RANGES,
  fetchAnalytics,
  toAnalyticsRange,
  type AnalyticsRange,
  type VolumeSeries,
} from "@/lib/analytics";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { NavRow } from "@/components/pulse/nav-row";
import { Bento, BentoTile } from "@/components/pulse/bento";
import { Alert } from "@/components/pulse/alert";
import { VolumeChart } from "@/components/pulse/volume-chart";
import { Card } from "@/components/ui/card";
import { toMuscleBars, type MuscleBar } from "@/lib/muscle-distribution";
import { toRecordRows, type RecordRow } from "@/lib/records-view";
import {
  toVolumeRows,
  formatVolumeDelta,
  formatCoverageCaption,
} from "@/lib/volume-view";
import { cn } from "@/lib/utils";

// The Analytics screen (F3 Slice 1–4): honest, range-scoped counts drawn straight
// from the record side — sessions, active days, total sets, new PRs — plus the
// set-count muscle distribution and the Recent Records feed, rendered in the
// operator theme and reachable from the Stats tab. The records feed is decoupled
// from the range toggle, so it shows all-time PRs even when the window is quiet. A
// user who has logged nothing sees a clear empty state, not an error.
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rawRange } = await searchParams;
  const range = toAnalyticsRange(rawRange);
  const envelope = await fetchAnalytics(range);

  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // STATS" title="Analytics" />
        <Alert tone="error">
          Could not load your analytics: {envelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const overview = envelope.data;
  const hasHistory = overview.sessions > 0;
  const muscleBars = toMuscleBars(overview.muscle_distribution);
  const recordRows = toRecordRows(overview.recent_records);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // STATS" title="Analytics" />

      <RangeToggle active={range} />

      {hasHistory ? (
        <>
          <TotalVolume volume={overview.volume} range={range} />
          <Bento>
            <BentoTile label="SESSIONS" value={overview.sessions} />
            <BentoTile label="ACTIVE DAYS" value={overview.active_days} />
            <BentoTile label="TOTAL SETS" value={overview.total_sets} />
            <BentoTile label="NEW PRS" value={overview.new_prs} />
          </Bento>
          <MuscleDistribution bars={muscleBars} />
        </>
      ) : (
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="font-sans text-sm text-text-secondary">
            No training logged in this window yet. Log a workout and your
            sessions, active days, and total sets will appear here.
          </p>
          <Link
            href="/sessions/new"
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Generate a workout →
          </Link>
        </Card>
      )}

      {recordRows.length > 0 ? <RecentRecords rows={recordRows} /> : null}

      <div className="flex flex-col gap-4">
        <SectionHeader>OPERATIONS</SectionHeader>
        <Card className="divide-y divide-border overflow-hidden py-0">
          <NavRow
            icon={History}
            label="Training history"
            href="/history"
            accent="cyan"
          />
          <NavRow
            icon={LineChart}
            label="Metric history"
            href="/metrics"
            accent="violet"
          />
        </Card>
      </div>
    </section>
  );
}

// A stable, curated color per Muscle Group so the split reads consistently across
// visits. Unclassified is deliberately muted — it is the honest "leftovers"
// bucket, shown but never competing with a real group for the eye.
const GROUP_COLOR: Record<string, string> = {
  Legs: "bg-cyan",
  Chest: "bg-violet",
  Back: "bg-blue",
  Shoulders: "bg-magenta",
  Arms: "bg-cyan",
  Core: "bg-violet",
  Unclassified: "bg-text-muted",
};

// The set-count muscle distribution as a stack of labeled horizontal bars in the
// operator theme (F3 Slice 2). Each group's fill width is its exact share, so the
// bars stay proportional even as the labels round. Weighted purely by set count —
// no Load, no Estimated 1RM — so no single heavy lift can dominate the split.
function MuscleDistribution({ bars }: { bars: MuscleBar[] }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>MUSCLE SPLIT</SectionHeader>
      <Card className="flex flex-col gap-3 p-6">
        {bars.length === 0 ? (
          <p className="font-sans text-sm text-text-secondary">
            No muscle data yet — the sets logged in this window don&apos;t list
            targeted muscles.
          </p>
        ) : (
          bars.map((bar) => (
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
          ))
        )}
      </Card>
    </div>
  );
}

// The total-volume line chart (F3 Slice 5): daily kg volume converted from typed
// Loads, with the "+N%" trend delta against the immediately preceding equal-length
// window and a caption disclosing coverage — the share of logged volume the line
// actually computed. Bodyweight and %-1RM sets aren't convertible yet, so a window of
// only those work reads as an honest empty state, not a fabricated zero line.
function TotalVolume({
  volume,
  range,
}: {
  volume: VolumeSeries;
  range: AnalyticsRange;
}) {
  const rows = toVolumeRows(volume.points);
  const delta = formatVolumeDelta(volume.delta);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>TOTAL VOLUME</SectionHeader>
      <Card className="flex flex-col gap-4 p-6">
        {rows.length === 0 ? (
          <p className="font-sans text-sm text-text-secondary">
            No absolute-load volume in this window yet. Log sets with a weight in
            kilograms and your total volume will chart here.
          </p>
        ) : (
          <>
            {delta ? (
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-semibold text-text-primary tabular-nums">
                  {delta}
                </span>
                <span className="label-mono text-[11px] text-text-muted">
                  vs. previous {RANGE_LABELS[range]}
                </span>
              </div>
            ) : null}
            <VolumeChart rows={rows} />
            <p className="label-mono text-[11px] text-text-muted">
              {formatCoverageCaption(volume.coverage)}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

// The Recent Records feed (F3 Slice 4): the last 8 Personal Records all-time, newest
// first, each a row of Exercise · new Estimated 1RM · gain over the prior PR · date.
// Deliberately decoupled from the range toggle so genuine strength milestones stay
// visible even on a quiet week. PRs are derived read-time from Logged Sets — a
// heavier estimated max at more reps outranks a lighter true single.
function RecentRecords({ rows }: { rows: RecordRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>RECENT RECORDS</SectionHeader>
      <Card className="divide-y divide-border overflow-hidden py-0">
        {rows.map((row, index) => (
          <div
            key={`${row.exercise}-${row.date}-${index}`}
            className="flex items-center gap-3.5 px-4 py-3.5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-cyan-dim text-cyan">
              <Trophy className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="font-sans text-[15px] font-medium text-text-primary">
                {row.exercise}
              </span>
              <span className="label-mono text-[11px] text-text-muted">
                {row.gain} · {row.date}
              </span>
            </div>
            <span className="font-display text-lg font-semibold text-text-primary tabular-nums">
              {row.estimate}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "7D",
  "30d": "30D",
  "90d": "90D",
};

// The 7D / 30D / 90D window selector. Server-rendered as links so the screen
// needs no client JavaScript; the active window is scoped via ?range=.
function RangeToggle({ active }: { active: AnalyticsRange }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1">
      {ANALYTICS_RANGES.map((range) => {
        const isActive = range === active;
        return (
          <Link
            key={range}
            href={`/analytics?range=${range}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex-1 rounded-sm py-1.5 text-center label-mono text-[11px] font-semibold transition-colors",
              isActive
                ? "bg-cyan/15 text-cyan"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            {RANGE_LABELS[range]}
          </Link>
        );
      })}
    </div>
  );
}
