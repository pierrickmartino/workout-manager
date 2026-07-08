import { notFound } from "next/navigation";

import { fetchExercise } from "@/lib/sessions";
import { fetchExerciseProgress } from "@/lib/progress";
import { fetchExerciseRecords } from "@/lib/exercise-records";
import { toExerciseTab } from "@/lib/exercise-detail-view";
import { PageHeader } from "@/components/pulse/page-header";
import { Alert } from "@/components/pulse/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExerciseTabs } from "@/components/exercise/exercise-tabs";
import { StatHeader } from "@/components/exercise/stat-header";
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
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const exerciseId = Number(id);
  if (!Number.isInteger(exerciseId)) notFound();

  const { tab: rawTab } = await searchParams;
  const tab = toExerciseTab(rawTab);

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

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PULSE // EXERCISE"
        title={exercise.name}
        action={
          exercise.provenance === "ai_generated" ? (
            <Badge variant="magenta" title="AI-generated, not yet reviewed">
              AI-GEN
            </Badge>
          ) : (
            <Badge variant="cyan">CURATED</Badge>
          )
        }
      />

      {records ? <StatHeader records={records} /> : null}

      <ExerciseTabs exerciseId={exerciseId} active={tab} />

      {tab === "specs" ? (
        <SpecsPanel
          exercise={exercise}
          topSetSeries={records?.top_set_series ?? []}
        />
      ) : null}
      {tab === "history" ? <HistoryTab exerciseId={exerciseId} /> : null}
      {tab === "records" ? <RecordsPanel /> : null}

      <AddToProtocolSeam />
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

// ADD TO PROTOCOL is deferred to F4 (ADR-0017): a Protocol is fully enumerated up
// front and no "append an Exercise" mutation exists yet, so this ships as an honest
// disabled seam — visibly present, clearly labelled, and doing nothing — rather than
// a dead or fabricated write.
function AddToProtocolSeam() {
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant="primary"
        className="w-full"
        disabled
        aria-disabled="true"
        title="Arrives with the Protocol Builder"
      >
        Add to Protocol
      </Button>
      <p className="label-mono text-[10px] text-text-muted">
        Arrives with the Protocol Builder
      </p>
    </div>
  );
}
