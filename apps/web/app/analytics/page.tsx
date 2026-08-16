import Link from "next/link";
import { Dumbbell, History, LineChart, Trophy } from "lucide-react";

import {
  ANALYTICS_RANGES,
  fetchAnalytics,
  toAnalyticsRange,
  type AnalyticsRange,
  type VolumeSeries,
  type DistanceSeries,
} from "@/lib/analytics";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { NavRow } from "@/components/pulse/nav-row";
import { Bento, BentoTile } from "@/components/pulse/bento";
import { Alert } from "@/components/pulse/alert";
import { VolumeChart } from "@/components/pulse/volume-chart";
import { DistanceChart } from "@/components/pulse/distance-chart";
import { MuscleSplit } from "@/components/pulse/muscle-split";
import { MuscleCoverage } from "@/components/analytics/muscle-coverage";
import { Card } from "@/components/ui/card";
import { toMuscleBars, type MuscleBar } from "@/lib/muscle-distribution";
import { toCoverageView } from "@/lib/muscle-coverage-view";
import {
  toRecordRows,
  toRecentRecordsTeaser,
  type RecordRow,
  type RecentRecordsTeaser,
} from "@/lib/records-view";
import {
  toVolumeRows,
  formatVolumeDelta,
  formatCoverageCaption,
} from "@/lib/volume-view";
import { toDistanceBars, formatDistanceDelta } from "@/lib/distance-view";
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
  const coverageView = toCoverageView(overview.coverage);
  const recordRows = toRecordRows(overview.recent_records);
  // The Strength Analytics screen is offered only to a user with qualifying strength
  // history — the same condition the strength read model gates on
  // (`has_qualifying_strength`): at least one all-time Personal Record. Gating on the
  // feed already in hand keeps this screen a single fetch rather than lure a user with
  // no comparable strength history into an empty screen. The same teaser drives both the
  // Recent Records "See all records →" link and the Operations nav entry, so the two
  // affordances into the strength screen can never disagree (ADR-0011).
  const recordsTeaser = toRecentRecordsTeaser(overview.recent_records);
  const hasQualifyingStrength = recordsTeaser !== null;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // STATS" title="Analytics" />

      <RangeToggle active={range} />

      {hasHistory ? (
        <>
          <TotalVolume volume={overview.volume} range={range} />
          {overview.distance.has_distance ? (
            <WeeklyDistance distance={overview.distance} range={range} />
          ) : null}
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

      {/* Muscle Group Coverage (ADR-0025): ungated and type-neutral, beside the Muscle
          Split — presence next to proportion. Rendered for every user, including a pure
          yoga/mobility/bodyweight history, over its own fixed 8-week window. */}
      <MuscleCoverage view={coverageView} />

      {recordRows.length > 0 ? (
        <RecentRecords rows={recordRows} teaser={recordsTeaser} />
      ) : null}

      <div className="flex flex-col gap-4">
        <SectionHeader>OPERATIONS</SectionHeader>
        <Card className="divide-y divide-border overflow-hidden py-0">
          {hasQualifyingStrength ? (
            <NavRow
              icon={Dumbbell}
              label="Strength Analytics"
              href="/analytics/strength"
              accent="cyan"
            />
          ) : null}
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

// The set-count muscle distribution for the analytics window: the shared MuscleSplit
// bars under the screen's section heading and Card.
function MuscleDistribution({ bars }: { bars: MuscleBar[] }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>MUSCLE SPLIT</SectionHeader>
      <Card className="flex flex-col gap-3 p-6">
        <MuscleSplit
          bars={bars}
          emptyMessage="No muscle data yet — the sets logged in this window don't list targeted muscles."
        />
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

// The Weekly Distance chart (ADR-0049): the endurance counterpart to Total Volume, one
// bar per Monday-anchored week in kilometres, summed from `distance`-kind Quantities. It
// carries the "+N%" trend delta against the immediately preceding equal-length window but
// — unlike volume — no coverage caption: a distance Quantity is exact metres, so nothing
// sits uncovered. Rendered only for a user with all-time distance work; a window with no
// runs reads as an honest empty state, not a fabricated zero bar.
function WeeklyDistance({
  distance,
  range,
}: {
  distance: DistanceSeries;
  range: AnalyticsRange;
}) {
  const rows = toDistanceBars(distance.weeks);
  const delta = formatDistanceDelta(distance.delta);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>WEEKLY DISTANCE</SectionHeader>
      <Card className="flex flex-col gap-4 p-6">
        {rows.length === 0 ? (
          <p className="font-sans text-sm text-text-secondary">
            No distance logged in this window yet. Log a run and your weekly
            kilometres will chart here.
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
            <DistanceChart rows={rows} />
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
// heavier estimated max at more reps outranks a lighter true single. When the user has
// qualifying strength history, the section header carries a teaser into the full,
// all-time PR timeline on the Strength Analytics screen (ADR-0011): the 8-cap feed is a
// teaser here, not the only PR-history surface.
function RecentRecords({
  rows,
  teaser,
}: {
  rows: RecordRow[];
  teaser: RecentRecordsTeaser | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        meta={
          teaser ? (
            <Link
              href={teaser.href}
              className="text-cyan hover:underline"
            >
              {teaser.label}
            </Link>
          ) : null
        }
      >
        RECENT RECORDS
      </SectionHeader>
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
  "30d": "30D",
  "90d": "90D",
  "150d": "150D",
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
