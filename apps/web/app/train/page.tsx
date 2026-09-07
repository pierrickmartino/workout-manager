import Link from "next/link";
import { LibraryBig, ListChecks } from "lucide-react";

import { GenerateTrainingLaunchpad } from "@/components/pulse/generate-training-launchpad";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { RecentSessions } from "@/components/RecentSessions";
import { buttonVariants } from "@/components/ui/button";
import { fetchHistory } from "@/lib/logs";
import { fetchSession, fetchSessions } from "@/lib/sessions";
import {
  buildRecentSessionRow,
  selectRecentSessions,
  type RecentSessionRow,
} from "@/lib/recent-sessions";

// Load the "Recent Sessions" panel rows (CONTEXT: Recent Sessions). Recency and dedupe come from
// the record (History), standalone-ness and names from the library (My Sessions), and the
// exercise preview from each plan's detail read — so we deep-link Start straight into the plan
// the button runs, never the last record. The panel is a convenience, so a failed read simply
// yields no rows (the launchpad below always covers "start something new") rather than erroring
// the whole Train page.
async function loadRecentSessions(): Promise<RecentSessionRow[]> {
  const [historyEnvelope, sessionsEnvelope] = await Promise.all([
    fetchHistory(),
    fetchSessions(),
  ]);
  if (
    !historyEnvelope.success ||
    !historyEnvelope.data ||
    !sessionsEnvelope.success ||
    !sessionsEnvelope.data
  ) {
    return [];
  }

  // Select the up-to-five distinct standalone plans performed most recently, then read each
  // plan's detail in parallel for its first exercises. A detail read that fails simply drops
  // that row rather than blocking the panel.
  const selections = selectRecentSessions(
    historyEnvelope.data,
    sessionsEnvelope.data,
  );
  const details = await Promise.all(
    selections.map((selection) => fetchSession(selection.session.id)),
  );

  return selections.flatMap((selection, index) => {
    const detail = details[index];
    if (!detail.success || !detail.data) return [];
    return [buildRecentSessionRow(selection, detail.data.prescriptions)];
  });
}

// The TRAIN tab's landing page: pick up a recent workout, or start something new — a full
// multi-week Protocol or a standalone workout. Previously the TRAIN tab jumped straight into
// the standalone-workout form, so protocol generation had no home in the global nav once a
// Current Protocol existed (ADR-0037). This launchpad restores the protocol entry point
// everywhere, not just the Home empty state; the Recent Sessions panel above it lets a user
// re-run a recent standalone Session in one tap (CONTEXT: Recent Sessions).
export default async function TrainPage(): Promise<React.JSX.Element> {
  const recentSessions = await loadRecentSessions();

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // TRAIN" title="Start new training" />

      {/* Pick up where you left off: the user's up-to-five most-recently-performed standalone
          Sessions, each a one-tap Start into a Live Session (CONTEXT: Recent Sessions). Renders
          nothing when there is nothing to resume, so it sits quietly above "start new". */}
      <RecentSessions rows={recentSessions} />

      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Generate a full multi-week protocol or a single standalone workout — or log a
        past workout you did yourself, no AI.
      </p>
      <GenerateTrainingLaunchpad
        eyebrow="TRAIN // START SOMETHING NEW"
        showLogPastWorkout
      />

      {/* The user's own saved standalone Sessions — reopen one to run again (CONTEXT: My
          Sessions, issue #397). Distinct from generation (starting something new) and from
          Browse the Catalog (movement discovery). */}
      <div className="flex flex-col gap-2">
        <span className="label-mono text-[11px] text-text-muted">
          TRAIN // MY LIBRARY
        </span>
        <Link
          href="/sessions"
          className={buttonVariants({ variant: "secondary", className: "w-full" })}
        >
          <ListChecks className="h-4 w-4" />
          My sessions
        </Link>
      </div>

      {/* Discovery, distinct from generation: browse the whole shared Catalog to find
          movements, without starting a plan (ADR-0042). */}
      <div className="flex flex-col gap-2">
        <span className="label-mono text-[11px] text-text-muted">
          TRAIN // EXPLORE
        </span>
        <Link
          href="/exercises"
          className={buttonVariants({ variant: "secondary", className: "w-full" })}
        >
          <LibraryBig className="h-4 w-4" />
          Browse the exercise catalog
        </Link>
      </div>

      <BackLink href="/dashboard">Back to dashboard</BackLink>
    </section>
  );
}
