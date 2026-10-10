import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchExercise } from "@/lib/sessions";
import { fetchExerciseProgress } from "@/lib/progress";
import { fetchExerciseRecords } from "@/lib/exercise-records";
import { fetchHome } from "@/lib/home";
import { resolveAppearance } from "@/lib/appearance";
import { bestEffortData, settleBestEffort } from "@/lib/best-effort-read";
import type { WeightUnit } from "@/lib/weight-unit";
import { toExerciseTab } from "@/lib/exercise-detail-view";
import { toProgressStoryView } from "@/lib/progress-story-view";
import { backTarget } from "@/lib/back-target";
import type { ProtocolProgress } from "@/lib/protocols-types";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { Skeleton } from "@/components/pulse/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ExerciseTabs } from "@/components/exercise/exercise-tabs";
import { StatHeader } from "@/components/exercise/stat-header";
import { SpecsPanel } from "@/components/exercise/specs-panel";
import { HistoryPanel } from "@/components/exercise/history-panel";
import { RecordsPanel } from "@/components/exercise/records-panel";
import { ProgressStoryCard } from "@/components/pulse/progress-story";

// The Exercise Detail page (F6 Slice 1): Pulse's tabbed layout over honest reads
// (ADR-0017). A single header carries the name and AI-GEN / CURATED provenance,
// then SPECS / HISTORY / RECORDS tabs — the active lens is URL-driven via ?tab= so
// refresh and shared links land on the same tab. The catalog is global, but the API
// still requires authentication.
export default async function ExercisePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; from?: string }>;
}) {
  const { id } = await params;
  const exerciseId = Number(id);
  if (!Number.isInteger(exerciseId)) notFound();

  const { tab: rawTab, from } = await searchParams;
  const tab = toExerciseTab(rawTab);

  // The Exercise catalog is reachable from many origins (a Session's Exercise, a
  // Protocol's, the Dashboard's PR card, an Analytics tile, a related movement), so
  // "back" follows the `?from=` the opening link carried — validated to an internal
  // path — and falls back to the Dashboard when absent or untrusted (see back-target).
  const back = backTarget(from);

  // Four independent reads, settled together rather than in sequence. None takes an input from
  // another, so awaiting them one at a time cost four serial round trips for one page
  // (perf audit A1). Only `fetchExercise` may reject: the other three are best-effort, and
  // `settleBestEffort` is what stops a flaky one rejecting the whole settle and taking down a
  // page written to render without it — see `lib/best-effort-read.ts`. `resolveAppearance`
  // needs no catch: it get-or-defaults and is documented never to throw.
  //
  //   - The stat header reads the record side (Personal Record + Total Sets) and sits above the
  //     tabs on every lens, so it is fetched here rather than per-tab. A failed read simply
  //     omits the header — the catalog SPECS content still renders — rather than breaking the
  //     page or fabricating figures.
  //   - ADD TO PROTOCOL targets the user's Current Protocol (ADR-0021), so the Home read
  //     supplies it. A failed read simply leaves the control a disabled seam rather than
  //     breaking the page or fabricating a target.
  //   - The reader's Weight Unit steers every weight surface on this screen — the stat header's
  //     Personal Record, the SPECS Top-Set Trend, the RECORDS milestones, and each HISTORY Load
  //     (#417). One cached read, shared with the layout.
  const [envelope, recordsResult, homeResult, { weight_unit: unit }] =
    await Promise.all([
      fetchExercise(exerciseId),
      settleBestEffort(fetchExerciseRecords(exerciseId)),
      settleBestEffort(fetchHome()),
      resolveAppearance(),
    ]);

  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const exercise = envelope.data;
  const records = bestEffortData(recordsResult);
  const currentProtocol = bestEffortData(homeResult)?.current_protocol ?? null;

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PULSE // EXERCISE"
        title={exercise.name}
        action={
          <div className="flex items-center gap-1.5">
            {exercise.provenance === "ai_generated" ? (
              <Badge variant="magenta" title="AI-generated, not yet reviewed">
                AI-GEN
              </Badge>
            ) : (
              <Badge variant="cyan">CURATED</Badge>
            )}
          </div>
        }
      />

      {/* The Progress Story leads (ADR-0127): "how am I doing?" is answered first, from the
          same records read as the stat header beside it. */}
      {records ? (
        <ProgressStoryCard story={toProgressStoryView(records.story, unit)} />
      ) : null}
      {records ? <StatHeader records={records} unit={unit} /> : null}

      <ExerciseTabs exerciseId={exerciseId} active={tab} from={from} />

      {tab === "specs" ? (
        <SpecsPanel
          exercise={exercise}
          topSetSeries={records?.top_set_series ?? []}
          unit={unit}
          from={from}
        />
      ) : null}
      {/* HISTORY's read is nested one level down, so before this boundary nothing painted until
          it too had returned — five serial round trips on this tab (perf audit A1). The boundary
          buys exactly one thing, and it is worth being precise about which: the read still
          starts only after the settle above (this element is created by that render), so it is
          still two round trips — but the header, stat header, tabs and ADD TO PROTOCOL now flush
          after the first instead of waiting for the second.
          The audit's other option was to hoist this read into the settle when `tab ===
          "history"`; it prefers the boundary because hoisting would put the read on the critical
          path. Keeping it off the *other two tabs* entirely is the `tab === "history"` ternary's
          doing, not the boundary's — that was already true and still is. */}
      {tab === "history" ? (
        <Suspense fallback={<HistoryTabFallback />}>
          <HistoryTab exerciseId={exerciseId} unit={unit} />
        </Suspense>
      ) : null}
      {tab === "records" ? (
        <RecordsPanel
          milestones={records?.pr_milestones ?? []}
          bodyWeightNudge={records?.body_weight_nudge ?? false}
          unit={unit}
        />
      ) : null}

      <AddToProtocol
        exerciseId={exerciseId}
        exerciseName={exercise.name}
        currentProtocol={currentProtocol}
      />

      <BackLink href={back.href}>{back.label}</BackLink>
    </section>
  );
}

// HISTORY reads the record side, so it fetches only when its tab is active. An
// Exercise never logged shows an honest empty state (handled in HistoryPanel); a
// failed read surfaces the error rather than a fabricated empty history.
async function HistoryTab({
  exerciseId,
  unit,
}: {
  exerciseId: number;
  unit: WeightUnit;
}) {
  const envelope = await fetchExerciseProgress(exerciseId);
  if (!envelope.success || !envelope.data) {
    return (
      <Alert tone="error">
        Could not load history: {envelope.error ?? "unknown error"}
      </Alert>
    );
  }
  return <HistoryPanel progress={envelope.data} unit={unit} />;
}

// The streamed stand-in for HISTORY: three Logged-Session cards at the rendered height, so the
// swap costs no layout shift (ADR-0028 — skeletons over spinners, matched to the final size).
function HistoryTabFallback(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

// ADD TO PROTOCOL, now wired to the Protocol Builder (F4 Slice 7, ADR-0021). When the
// user has a Current Protocol with an un-performed Session, it deep-links into the
// builder with this Exercise queued for placement — the user drops it into a Session
// and DEPLOYs like any other staged edit (ADR-0020), never an immediate write. With no
// Protocol or no un-performed Session it stays the honest disabled seam ADR-0017 left,
// with a clear reason, rather than a faked or dead write.
function AddToProtocol({
  exerciseId,
  exerciseName,
  currentProtocol,
}: {
  exerciseId: number;
  exerciseName: string;
  currentProtocol: ProtocolProgress | null;
}) {
  const target = currentProtocol?.next_session ? currentProtocol : null;

  if (!target) {
    return (
      <AddToProtocolDisabled
        reason={
          currentProtocol
            ? "This protocol has no upcoming session to add to."
            : "Generate a protocol first."
        }
      />
    );
  }

  // Queue the Exercise (id + name) on the builder deep-link so it can be placed
  // without a second catalog fetch; the builder seeds it from these params.
  const href =
    `/protocols/${target.id}/edit` +
    `?queue=${exerciseId}` +
    `&queueName=${encodeURIComponent(exerciseName)}`;

  return (
    <Link href={href} className={buttonVariants({ className: "w-full" })}>
      Add to Protocol
    </Link>
  );
}

function AddToProtocolDisabled({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant="primary"
        className="w-full"
        disabled
        aria-disabled="true"
        title={reason}
      >
        Add to Protocol
      </Button>
      <p className="label-mono text-[10px] text-text-muted">{reason}</p>
    </div>
  );
}
