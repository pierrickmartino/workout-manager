import Link from "next/link";
import { Trophy } from "lucide-react";

import { fetchStrengthAnalytics } from "@/lib/strength-analytics";
import {
  STRENGTH_EMPTY_STATE_COPY,
  toStrengthTimelineView,
  type StrengthTimelineView,
} from "@/lib/strength-analytics-view";
import { toStrengthTrajectories } from "@/lib/strength-trajectories-view";
import { toMuscleBalance } from "@/lib/muscle-balance-view";
import { resolveAppearance } from "@/lib/appearance";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { Alert } from "@/components/pulse/alert";
import { StrengthTrajectories } from "@/components/analytics/strength-trajectories";
import { MuscleBalance } from "@/components/analytics/muscle-balance";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// The default PR-timeline page size — kept in step with the endpoint's default so the
// first page matches whether or not a ?offset= is supplied.
const TIMELINE_LIMIT = 20;

// The Strength Analytics screen: a dedicated strength lens over the honest record side.
// It leads with the ranked strength trajectories (issue #177) — small-multiples of the
// user's most-trained qualifying lifts, each tapping through to its full Exercise Detail
// chart — then the complete Personal Record timeline as a flat reverse-chronological
// stream (Exercise · new Estimated 1RM · gain over the prior PR · date). Everything is a
// read-time projection over Logged Sets; a user with no qualifying strength history sees
// an honest empty state that explains what a strength record needs, never a fabricated
// zero, and the trajectories section hides itself when there are no qualifying lifts. A
// thin renderer: all row/tile shaping, paging, and the empty/gate decision live in the
// `strength-analytics-view` and `strength-trajectories-view` view-models.
export default async function StrengthAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const { offset: rawOffset } = await searchParams;
  const offset = toOffset(rawOffset);
  const envelope = await fetchStrengthAnalytics(TIMELINE_LIMIT, offset);

  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // STATS" title="Strength Analytics" />
        <Alert tone="error">
          Could not load your strength analytics:{" "}
          {envelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const { weight_unit: unit } = await resolveAppearance();
  const total = envelope.meta?.total ?? envelope.data.records.length;
  const view = toStrengthTimelineView(
    envelope.data,
    {
      limit: TIMELINE_LIMIT,
      offset,
      total,
    },
    unit,
  );
  const trajectories = toStrengthTrajectories(envelope.data.trajectories, unit);
  const muscleBalance = toMuscleBalance(envelope.data.muscle_balance);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // STATS" title="Strength Analytics" />

      {view.isEmpty ? (
        <StrengthEmptyState />
      ) : (
        <>
          <StrengthTrajectories tiles={trajectories} unit={unit} />
          <MuscleBalance view={muscleBalance} />
          <PersonalRecordTimeline view={view} offset={offset} />
        </>
      )}
    </section>
  );
}

// Narrow an untrusted ?offset= query value to a non-negative page start, defaulting to
// the first page so a hand-edited URL can never break the screen.
function toOffset(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

// The honest empty state for a user with no qualifying strength history: it explains
// exactly what a strength record needs — naming both the absolute-load and the bodyweight
// path (ADR-0026) — rather than showing a fabricated "0 kg". The copy lives in the
// view-model so it stays testable and beside the gate decision that surfaces it.
function StrengthEmptyState() {
  return (
    <Card className="flex flex-col items-start gap-3 p-6">
      <p className="font-sans text-sm text-text-secondary">
        {STRENGTH_EMPTY_STATE_COPY}
      </p>
      <Link
        href="/sessions/new"
        className="label-mono text-[11px] text-cyan hover:underline"
      >
        Generate a workout →
      </Link>
    </Card>
  );
}

// The Personal Record timeline: a flat reverse-chronological stream, each row a
// milestone of Exercise · new Estimated 1RM · gain over the prior PR · date. Derived
// read-time from Logged Sets — a heavier estimated max at more reps outranks a lighter
// true single. Paged so a long strength history stays scannable.
function PersonalRecordTimeline({
  view,
  offset,
}: {
  view: StrengthTimelineView;
  offset: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>PERSONAL RECORDS</SectionHeader>
      <Card className="divide-y divide-border overflow-hidden py-0">
        {view.rows.map((row, index) => (
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
      <TimelinePager view={view} offset={offset} />
    </div>
  );
}

// Prev/next links that walk the timeline by page. Server-rendered as links so the
// screen needs no client JavaScript; each link scopes the page via ?offset=. A link is
// muted and non-navigating at the ends of the timeline.
function TimelinePager({
  view,
  offset,
}: {
  view: StrengthTimelineView;
  offset: number;
}) {
  if (!view.hasPreviousPage && !view.hasNextPage) {
    return null;
  }

  const previousOffset = Math.max(0, offset - TIMELINE_LIMIT);
  const nextOffset = offset + TIMELINE_LIMIT;

  return (
    <div className="flex items-center justify-between">
      <PagerLink
        href={`/analytics/strength?offset=${previousOffset}`}
        enabled={view.hasPreviousPage}
      >
        ← Newer
      </PagerLink>
      <PagerLink
        href={`/analytics/strength?offset=${nextOffset}`}
        enabled={view.hasNextPage}
      >
        Older →
      </PagerLink>
    </div>
  );
}

function PagerLink({
  href,
  enabled,
  children,
}: {
  href: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const className = cn(
    "label-mono text-[11px]",
    enabled
      ? "text-cyan hover:underline"
      : "pointer-events-none text-text-muted opacity-40",
  );

  return enabled ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}
