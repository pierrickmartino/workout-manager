import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";

import { fetchProfile, isProfileComplete } from "@/lib/profile";
import { READINESS_BADGE, fetchHome } from "@/lib/home";
import { fetchAnalytics } from "@/lib/analytics";
import { RANGE_LABELS } from "@/lib/analytics-range-view";
import { latestPrLine, operatorStatus } from "@/lib/home-view";
import { HOME_VOLUME_RANGE, homeReview } from "@/lib/home-review";
import { quickActions } from "@/lib/quick-actions";
import { resolveAppearance } from "@/lib/appearance";
import { settleBestEffort } from "@/lib/best-effort-read";
import { appendFrom } from "@/lib/back-target";
import { Alert } from "@/components/pulse/alert";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { SessionHero } from "@/components/pulse/session-hero";
import { ResumeSessionBanner } from "@/components/pulse/resume-session-banner";
import { TrainingRouteCard } from "@/components/pulse/training-route";
import { LevelBadge } from "@/components/pulse/level-badge";
import { Bento, BentoTile } from "@/components/pulse/bento";
import { QuickActions } from "@/components/pulse/quick-actions";
import { HomeColumns } from "@/components/pulse/home-columns";
import { GenerateTrainingLaunchpad } from "@/components/pulse/generate-training-launchpad";
import { VolumeChartWide } from "@/components/pulse/volume-chart-wide";
import { RecentRecords } from "@/components/pulse/recent-records";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// The dashboard renders the full Fitness Profile that round-tripped through
// Postgres on the FastAPI backend. New users (incomplete profile) are sent to
// onboarding first. Since the role-aware IA redesign (ADR-0071) Home is a launch
// surface: the Current Protocol hero, a persistent quick-action row for the core
// intents, and honest Operator status — no duplicated Fitness Profile snapshot and
// no duplicated navigation card (those live on Profile and Analytics respectively).
//
// At the shell's wide width (ADR-0088) Home is the first converted page: the launch surface
// keeps the main column and Operator status moves to a rail beside it, with a review column —
// total volume and recent records — that the 26rem layout has no room for. Those blocks are
// `hidden lg:block`: a Server Component cannot see the viewport, so they are rendered and
// hidden rather than branched on, which is the cost ADR-0088 names for refusing UA detection.
// Nothing below `lg:` moves, and nothing added is an action — read-time projections only, so
// ADR-0071's click budget is untouched.
export default async function DashboardPage() {
  const [profileEnvelope, homeEnvelope, appearance, analyticsEnvelope] =
    await Promise.all([
      fetchProfile(),
      fetchHome(),
      resolveAppearance(),
      // The review column's one extra read, and settling it is load-bearing: `apiGet` *rejects*
      // on a transport failure or a non-JSON response rather than returning an unsuccessful
      // envelope, and an uncaught rejection in this `Promise.all` would take Home down over a
      // block that is explicitly a bonus (#576 review). `settleBestEffort` is this file's own
      // `.catch(() => null)`, named and shared once the other three waterfall fixes needed the
      // same guard (`lib/best-effort-read.ts`); `homeReview` maps the `null` to "no review
      // column".
      settleBestEffort(fetchAnalytics(HOME_VOLUME_RANGE)),
    ]);

  if (!profileEnvelope.success || !profileEnvelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // DASHBOARD" title="Dashboard" />
        <Alert tone="error">
          Could not load your profile:{" "}
          {profileEnvelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const profile = profileEnvelope.data;
  if (!isProfileComplete(profile)) {
    redirect("/onboarding");
  }

  if (!homeEnvelope.success || !homeEnvelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // DASHBOARD" title="Dashboard" />
        <Alert tone="error">
          Could not load your readiness: {homeEnvelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const greeting = profile.display_name ?? "operator";
  const readiness = READINESS_BADGE[homeEnvelope.data.readiness];
  const currentProtocol = homeEnvelope.data.current_protocol;
  const status = operatorStatus(homeEnvelope.data.gamification);
  const latestPr = latestPrLine(homeEnvelope.data.latest_pr, appearance.weight_unit);
  const actions = quickActions(homeEnvelope.data);
  const review = homeReview(analyticsEnvelope, appearance.weight_unit);

  return (
    // `data-shell="wide"` is the opt-in the shell's content column answers to with `:has()`
    // (ADR-0088). Only this success path carries it: the error branches above stay 26rem,
    // because an error message has no business being 72rem wide.
    <section className="flex flex-col gap-7" data-shell="wide">
      <PageHeader
        overline="PULSE // DASHBOARD"
        title={<>Hey, {greeting}</>}
        action={<Badge variant={readiness.variant}>{readiness.label}</Badge>}
      />

      {/* Resume affordance: shown only when an unfinished Live Session is held in
          the client-side slot (ADR-0012). Renders nothing otherwise. */}
      <ResumeSessionBanner />

      {/* Below `lg:` a plain stacked column in this exact source order; at `lg:` the launch
          surface plus review column on the left, Operator status in a rail on the right. The
          grid lives in `HomeColumns` so `audit/wide.mjs` measures this layout, not a copy. */}
      <HomeColumns
        main={
          <>
            {/* Hero: the Current Protocol's Next Session, or the generate CTA when the
                user has no Current Protocol (no Protocol, or every one is complete). */}
            {currentProtocol ? (
              <>
                <SessionHero protocol={currentProtocol} />
                {/* The training route: the current week as named stops (done / next /
                    upcoming) with a WEEK n/total overline and an expandable full plan —
                    purely positional, no calendar (ADR-0008). Replaces the old dots and
                    keeps the sequence position and performed count honestly separate. */}
                <TrainingRouteCard protocol={currentProtocol} />
              </>
            ) : (
              <GenerateTrainingLaunchpad
                eyebrow="GET STARTED // NO ACTIVE PROTOCOL"
                from="/dashboard"
              />
            )}

            {/* Persistent quick-action row: the launch shortcuts for the recurring core
                intents (Start next / Build / Log / My sessions), rendered in both the
                active-protocol and empty states so a self-managed user is never stranded
                (docs/redesign-ia.md, ADR-0071). */}
            <QuickActions actions={actions} />

            {/* The review column — wide-width only, and projections only, never an action
                (ADR-0088). Each block renders nothing at all when its read was empty or
                failed, so a bodyweight-only trainee sees no empty axis and a failed
                analytics read costs Home nothing. */}
            {review.volume ? (
              <div className="hidden flex-col gap-4 lg:flex">
                <SectionHeader>TOTAL VOLUME</SectionHeader>
                <Card className="flex flex-col gap-4 p-6">
                  {review.volume.delta ? (
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-2xl font-semibold text-text-primary tabular-nums">
                        {review.volume.delta}
                      </span>
                      <span className="label-mono text-[11px] text-text-muted">
                        vs. previous {RANGE_LABELS[HOME_VOLUME_RANGE]}
                      </span>
                    </div>
                  ) : null}
                  {/* Mount-gated and dynamically imported, not merely CSS-hidden: a hidden
                      subtree still renders and hydrates, which put 110 KB gzipped of chart
                      library in the mobile Dashboard bundle (#576 review). The plot and its
                      `ChartValues` table still read one array, so every plotted datum is
                      retrievable as text with its year and unit (ADR-0084). */}
                  <VolumeChartWide rows={review.volume.rows} />
                  <p className="label-mono text-[11px] text-text-muted">
                    {review.volume.coverageCaption}
                  </p>
                </Card>
              </div>
            ) : null}

            {review.records ? (
              <div className="hidden lg:block">
                <RecentRecords
                  rows={review.records.rows}
                  teaser={review.records.teaser}
                />
              </div>
            ) : null}
          </>
        }
        rail={
          <>
            {/* Operator status: the account's Level / XP and weekly Streak, projected
                read-time from Logged Sessions (ADR-0018/0019). Deliberately OUTSIDE the
                Current-Protocol conditional so it renders in both the active and empty
                states, and drawn from the same read model as Profile so the two agree
                (issue #166). */}
            <SectionHeader>OPERATOR STATUS</SectionHeader>
            <LevelBadge xp={status.xp} level={status.level} />
            {/* Latest PR: the user's most recent Personal Record, linking to the
                Exercise. Rendered only when a PR exists — hidden, never "0 kg", for new
                accounts and bodyweight-only trainees (issue #167, ADR-0010). It stands down
                at `lg:` only when the Recent Records feed is there to supersede it: that
                feed opens with this same record, and showing both would be the duplication
                ADR-0071 removed from Home, not extra information. */}
            {latestPr ? (
              <Link
                href={appendFrom(`/exercises/${latestPr.exerciseId}`, "/dashboard")}
                className={cn(
                  "flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 transition-colors hover:border-cyan/40",
                  review.records && "lg:hidden",
                )}
              >
                <Trophy className="h-4 w-4 shrink-0 text-cyan" />
                <div className="flex flex-col">
                  <span className="label-mono text-[10px] text-text-muted">
                    LATEST PR
                  </span>
                  <span className="font-sans text-sm font-medium text-text-primary">
                    {latestPr.text}
                  </span>
                </div>
              </Link>
            ) : null}
            <Bento>
              <BentoTile
                label="STREAK"
                value={status.streak}
                caption={status.streak === 1 ? "WEEK" : "WEEKS"}
                span="full"
              />
            </Bento>
          </>
        }
      />
    </section>
  );
}
