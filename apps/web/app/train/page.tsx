import { Suspense } from "react";
import Link from "next/link";
import { LayoutGrid, LibraryBig, ListChecks } from "@/components/pulse/icons";

import {
  BuildWorkoutLink,
  GenerateTrainingLaunchpad,
  LaunchLinkPair,
  LogPastWorkoutLink,
} from "@/components/pulse/generate-training-launchpad";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { RecentSessionsPanel } from "@/components/recent-sessions-panel";
import { buttonVariants } from "@/components/ui/button";
import { NAV_FORWARD } from "@/lib/nav-direction";

// The TRAIN tab's landing page: start something new — a full multi-week Protocol or a
// standalone workout — or pick up an existing Session. Previously the TRAIN tab jumped straight
// into the standalone-workout form, so protocol generation had no home in the global nav once a
// Current Protocol existed (ADR-0037). This launchpad restores the protocol entry point
// everywhere, not just the Home empty state; the Recent Sessions panel by My Sessions lets a
// user re-run a recent standalone Session in one tap (GLOSSARY: Recent Sessions).
//
// The page is deliberately **synchronous**: every read it needs belongs to one panel, and it
// used to await that panel's whole chain before returning any JSX, so a fully static header,
// paragraph and launchpad waited on two sequential round trips plus an N-way fan-out (perf
// audit A4). The one read now sits behind a Suspense boundary in its own component, so the
// static surface — which is all of the "start something new" intent — paints immediately.
//
// The audit also lists `/train` among the routes with no `loading.tsx`, and it deliberately
// still has none: a `loading.tsx` is a segment-level Suspense boundary, so on this route it
// would replace a shell that is ready *now* with a skeleton of it, which is strictly worse than
// the boundary below. `loading.tsx` is the right tool for the routes whose page itself awaits;
// the ones the audit names got one.
export default function TrainPage(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // TRAIN" title="Start new training" />

      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Generate a full multi-week protocol or a single standalone workout — or build one
        by hand to run later, or log a past workout you did yourself, no AI.
      </p>
      {/* The two no-AI entry points are composed here rather than selected by flags: this page
          offers both, and Home's empty state offers neither (ADR-0109). They sit side by side,
          as Build and Log do in Home's quick-action row (ADR-0071). */}
      <GenerateTrainingLaunchpad eyebrow="TRAIN // START SOMETHING NEW" from="/train">
        <LaunchLinkPair>
          <BuildWorkoutLink />
          <LogPastWorkoutLink />
        </LaunchLinkPair>
      </GenerateTrainingLaunchpad>

      {/* Pick up where you left off: the user's up-to-five most-recently-performed standalone
          Sessions, each a one-tap Start into a Live Session (GLOSSARY: Recent Sessions). Sits just
          above My Sessions — both are about reusing existing Sessions, distinct from the "start
          new" launchpad — and renders nothing when there is nothing to resume.

          The fallback is `null`, not a skeleton: the panel legitimately renders nothing for a
          user with no standalone Session to resume, so a placeholder would promise a row that
          may never arrive and then collapse, shifting everything below it up. A skeleton has to
          match the final layout to be worth its flash (ADR-0028), and here the final layout is
          sometimes empty. */}
      <Suspense fallback={null}>
        <RecentSessionsPanel />
      </Suspense>

      {/* The user's own saved standalone Sessions — reopen one to run again (GLOSSARY: My
          Sessions, issue #397). Distinct from generation (starting something new) and from
          Browse the Catalog (movement discovery). */}
      <div className="flex flex-col gap-2">
        <h2 className="label-mono text-[11px] text-text-muted">
          TRAIN // MY LIBRARY
        </h2>
        <Link
          href="/sessions"
          {...NAV_FORWARD}
          className={buttonVariants({ variant: "secondary", className: "w-full" })}
        >
          <ListChecks className="h-4 w-4" />
          My sessions
        </Link>
        {/* Every Protocol the user owns — Current, set aside and finished (issue #637). */}
        <Link
          href="/protocols"
          {...NAV_FORWARD}
          className={buttonVariants({ variant: "secondary", className: "w-full" })}
        >
          <LayoutGrid className="h-4 w-4" />
          My protocols
        </Link>
      </div>

      {/* Discovery, distinct from generation: browse the whole shared Catalog to find
          movements, without starting a plan (ADR-0042). */}
      <div className="flex flex-col gap-2">
        <h2 className="label-mono text-[11px] text-text-muted">
          TRAIN // EXPLORE
        </h2>
        <Link
          href="/exercises"
          {...NAV_FORWARD}
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
