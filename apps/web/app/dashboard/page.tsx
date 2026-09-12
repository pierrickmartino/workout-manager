import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";

import { fetchProfile, isProfileComplete } from "@/lib/profile";
import { READINESS_BADGE, fetchHome } from "@/lib/home";
import { latestPrLine, operatorStatus } from "@/lib/home-view";
import { quickActions } from "@/lib/quick-actions";
import { resolveAppearance } from "@/lib/appearance";
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
import { GenerateTrainingLaunchpad } from "@/components/pulse/generate-training-launchpad";
import { Badge } from "@/components/ui/badge";

// The dashboard renders the full Fitness Profile that round-tripped through
// Postgres on the FastAPI backend. New users (incomplete profile) are sent to
// onboarding first. Since the role-aware IA redesign (ADR-0071) Home is a launch
// surface: the Current Protocol hero, a persistent quick-action row for the core
// intents, and honest Operator status — no duplicated Fitness Profile snapshot and
// no duplicated navigation card (those live on Profile and Analytics respectively).
export default async function DashboardPage() {
  const [profileEnvelope, homeEnvelope, appearance] = await Promise.all([
    fetchProfile(),
    fetchHome(),
    resolveAppearance(),
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

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PULSE // DASHBOARD"
        title={<>Hey, {greeting}</>}
        action={<Badge variant={readiness.variant}>{readiness.label}</Badge>}
      />

      {/* Resume affordance: shown only when an unfinished Live Session is held in
          the client-side slot (ADR-0012). Renders nothing otherwise. */}
      <ResumeSessionBanner />

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
        <GenerateTrainingLaunchpad eyebrow="GET STARTED // NO ACTIVE PROTOCOL" />
      )}

      {/* Persistent quick-action row: the launch shortcuts for the recurring core
          intents (Start next / Build / Log / My sessions), rendered in both the
          active-protocol and empty states so a self-managed user is never stranded
          (docs/redesign-ia.md, ADR-0071). */}
      <QuickActions actions={actions} />

      {/* Operator status: the account's Level / XP and weekly Streak, projected
          read-time from Logged Sessions (ADR-0018/0019). Deliberately OUTSIDE the
          Current-Protocol conditional so it renders in both the active and empty
          states, and drawn from the same read model as Profile so the two agree
          (issue #166). */}
      <div className="flex flex-col gap-4">
        <SectionHeader>OPERATOR STATUS</SectionHeader>
        <LevelBadge xp={status.xp} level={status.level} />
        {/* Latest PR: the user's most recent Personal Record, linking to the
            Exercise. Rendered only when a PR exists — hidden, never "0 kg", for new
            accounts and bodyweight-only trainees (issue #167, ADR-0010). */}
        {latestPr ? (
          <Link
            href={appendFrom(`/exercises/${latestPr.exerciseId}`, "/dashboard")}
            className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 transition-colors hover:border-cyan/40"
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
      </div>
    </section>
  );
}
