import Link from "next/link";
import { notFound } from "next/navigation";

import {
  fetchExerciseProgress,
  type ExerciseProgressPoint,
} from "@/lib/progress";

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
      <section>
        <h1>Exercise progress</h1>
        <p role="alert">
          Could not load progress: {envelope.error ?? "unknown error"}
        </p>
      </section>
    );
  }

  const progress = envelope.data;
  const title = progress.exercise_name || "this exercise";

  return (
    <section>
      <h1>Progress — {title}</h1>

      {progress.points.length === 0 ? (
        <p>
          You haven&apos;t logged {title} yet.{" "}
          <Link href="/history">Review your training history →</Link>
        </p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0 }}>
          {progress.points.map((point) => (
            <li key={point.logged_session_id} style={{ marginBottom: "1.5rem" }}>
              <ProgressPoint point={point} />
            </li>
          ))}
        </ol>
      )}

      <p>
        <Link href={`/exercises/${exerciseId}`}>← Back to exercise</Link>
      </p>
    </section>
  );
}

function ProgressPoint({ point }: { point: ExerciseProgressPoint }) {
  return (
    <article>
      <h2 style={{ marginBottom: "0.25rem" }}>{point.performed_on}</h2>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left", paddingRight: "1rem" }}>Set</th>
            <th style={{ textAlign: "left", paddingRight: "1rem" }}>Reps</th>
            <th style={{ textAlign: "left", paddingRight: "1rem" }}>Load</th>
            <th style={{ textAlign: "left" }}>Difficulty (RPE)</th>
          </tr>
        </thead>
        <tbody>
          {point.sets.map((set) => (
            <tr key={set.position}>
              <td style={{ paddingRight: "1rem" }}>{set.position + 1}</td>
              <td style={{ paddingRight: "1rem" }}>{set.reps}</td>
              <td style={{ paddingRight: "1rem" }}>{set.load ?? "—"}</td>
              <td>{set.perceived_difficulty ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
