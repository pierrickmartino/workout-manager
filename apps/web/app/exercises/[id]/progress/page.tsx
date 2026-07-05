import Link from "next/link";
import { notFound } from "next/navigation";

import {
  fetchExerciseProgress,
  type ExerciseProgressPoint,
} from "@/lib/progress";
import { formatLoad } from "@/lib/load";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";

// The per-exercise progress view (Slice 12): how the user's actual performance of
// one Exercise has changed over time, drawn purely from the record side (Logged
// Sessions / Logged Sets). Points are ordered oldest-first so the table reads
// top-to-bottom in time. An Exercise the user has never performed shows an empty
// series rather than an error.
export default async function ExerciseProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const exerciseId = Number(id);
  if (!Number.isInteger(exerciseId)) notFound();

  const envelope = await fetchExerciseProgress(exerciseId);
  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // PROGRESS" title="Exercise progress" />
        <Alert tone="error">
          Could not load progress: {envelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const progress = envelope.data;
  const title = progress.exercise_name || "this exercise";

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // PROGRESS" title={title} />

      {progress.points.length === 0 ? (
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="font-sans text-sm text-text-secondary">
            You haven&apos;t logged {title} yet.
          </p>
          <Link
            href="/history"
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Review your training history →
          </Link>
        </Card>
      ) : (
        <ol className="flex list-none flex-col gap-4 p-0">
          {progress.points.map((point) => (
            <li key={point.logged_session_id}>
              <ProgressPoint point={point} />
            </li>
          ))}
        </ol>
      )}

      <BackLink href={`/exercises/${exerciseId}`}>Back to exercise</BackLink>
    </section>
  );
}

function ProgressPoint({ point }: { point: ExerciseProgressPoint }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="label-mono text-[11px] text-cyan">{point.performed_on}</h2>

      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-2 px-1">
          <span className="label-mono text-[9px] text-text-muted">Set</span>
          <span className="label-mono text-right text-[9px] text-text-muted">
            Reps
          </span>
          <span className="label-mono text-right text-[9px] text-text-muted">
            Load
          </span>
          <span className="label-mono text-right text-[9px] text-text-muted">
            RPE
          </span>
        </div>
        {point.sets.map((set) => (
          <div
            key={set.position}
            className="grid grid-cols-[2.5rem_1fr_1fr_1fr] items-center gap-2 rounded-sm border border-border bg-base/40 px-3 py-2.5"
          >
            <span className="font-mono text-[13px] font-bold text-cyan">
              {set.position + 1}
            </span>
            <span className="text-right font-display text-sm font-semibold text-text-primary">
              {set.reps}
            </span>
            <span className="text-right font-mono text-[13px] text-text-secondary">
              {formatLoad(set.load)}
            </span>
            <span className="text-right font-mono text-[13px] text-cyan">
              {set.perceived_difficulty ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
