import Link from "next/link";
import { Trophy } from "lucide-react";

import { fetchStrengthAnalytics } from "@/lib/strength-analytics";
import {
  toStrengthTimelineView,
  type StrengthTimelineView,
} from "@/lib/strength-analytics-view";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// The default PR-timeline page size — kept in step with the endpoint's default so the
// first page matches whether or not a ?offset= is supplied.
const TIMELINE_LIMIT = 20;

// The Strength Analytics screen (F-strength Slice 1): a dedicated strength lens over the
// honest record side, showing the user's complete Personal Record timeline as a flat
// reverse-chronological stream — each row the Exercise, its new Estimated 1RM, the gain
// over the prior PR, and the date. Everything is a read-time projection over Logged Sets;
// a user with no qualifying strength history sees an honest empty state that explains what
// a strength record needs, never a fabricated zero. A thin renderer: all row shaping,
// paging, and the empty/gate decision live in the `strength-analytics-view` view-model.
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

  const total = envelope.meta?.total ?? envelope.data.records.length;
  const view = toStrengthTimelineView(envelope.data, {
    limit: TIMELINE_LIMIT,
    offset,
    total,
  });

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // STATS" title="Strength Analytics" />

      {view.isEmpty ? (
        <StrengthEmptyState />
      ) : (
        <PersonalRecordTimeline view={view} offset={offset} />
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
// exactly what a strength record needs rather than showing a fabricated "0 kg".
function StrengthEmptyState() {
  return (
    <Card className="flex flex-col items-start gap-3 p-6">
      <p className="font-sans text-sm text-text-secondary">
        No strength records yet. A strength record comes from a set logged with a
        weight in kilograms at 1–12 reps — enough to estimate a one-rep max. Log a
        few working sets and your Personal Record timeline will build here.
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
