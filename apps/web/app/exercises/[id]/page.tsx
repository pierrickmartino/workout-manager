import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchExercise } from "@/lib/sessions";
import { fetchExerciseProgress } from "@/lib/progress";
import { fetchExerciseRecords } from "@/lib/exercise-records";
import { fetchHome } from "@/lib/home";
import { toExerciseTab } from "@/lib/exercise-detail-view";
import { backTarget } from "@/lib/back-target";
import type { ProtocolProgress } from "@/lib/protocols-types";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ExerciseTabs } from "@/components/exercise/exercise-tabs";
import { StatHeader } from "@/components/exercise/stat-header";
import { CompletenessBadge } from "@/components/exercise/completeness-badge";
import { SpecsPanel } from "@/components/exercise/specs-panel";
import { HistoryPanel } from "@/components/exercise/history-panel";
import { RecordsPanel } from "@/components/exercise/records-panel";

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

  const envelope = await fetchExercise(exerciseId);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const exercise = envelope.data;

  // The stat header reads the record side (Personal Record + Total Sets) and sits
  // above the tabs on every lens, so it is fetched here rather than per-tab. A failed
  // read simply omits the header — the catalog SPECS content still renders — rather
  // than breaking the page or fabricating figures.
  const recordsEnvelope = await fetchExerciseRecords(exerciseId);
  const records =
    recordsEnvelope.success && recordsEnvelope.data ? recordsEnvelope.data : null;

  // ADD TO PROTOCOL targets the user's Current Protocol (ADR-0021), so the Home read
  // supplies it here. A failed read simply leaves the control a disabled seam rather
  // than breaking the page or fabricating a target.
  const homeEnvelope = await fetchHome();
  const currentProtocol =
    homeEnvelope.success && homeEnvelope.data
      ? homeEnvelope.data.current_protocol
      : null;

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
            <CompletenessBadge completeness={exercise.completeness} />
          </div>
        }
      />

      {records ? <StatHeader records={records} /> : null}

      <ExerciseTabs exerciseId={exerciseId} active={tab} from={from} />

      {tab === "specs" ? (
        <SpecsPanel
          exercise={exercise}
          topSetSeries={records?.top_set_series ?? []}
          from={from}
        />
      ) : null}
      {tab === "history" ? <HistoryTab exerciseId={exerciseId} /> : null}
      {tab === "records" ? (
        <RecordsPanel
          milestones={records?.pr_milestones ?? []}
          bodyWeightNudge={records?.body_weight_nudge ?? false}
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
async function HistoryTab({ exerciseId }: { exerciseId: number }) {
  const envelope = await fetchExerciseProgress(exerciseId);
  if (!envelope.success || !envelope.data) {
    return (
      <Alert tone="error">
        Could not load history: {envelope.error ?? "unknown error"}
      </Alert>
    );
  }
  return <HistoryPanel progress={envelope.data} />;
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
