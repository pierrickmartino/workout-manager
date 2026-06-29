import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchExercise } from "@/lib/sessions";
import type {
  ExerciseDetail,
  RelatedExerciseSummary,
} from "@/lib/sessions-types";

// The enriched detail of a single catalog Exercise: description, execution
// instructions, targeted muscles, difficulty, required equipment, precautions,
// and the typed Variations / Alternatives a user can substitute toward. The
// catalog is global, but the API still requires authentication.
export default async function ExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const exerciseId = Number(id);
  if (!Number.isInteger(exerciseId)) notFound();

  const envelope = await fetchExercise(exerciseId);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const exercise = envelope.data;

  return (
    <section>
      <h1>{exercise.name}</h1>
      {exercise.provenance === "ai_generated" ? (
        <p
          title="AI-generated, not yet reviewed"
          style={{ fontSize: "0.8rem", color: "#92400e" }}
        >
          (AI-generated)
        </p>
      ) : null}

      {exercise.description ? <p>{exercise.description}</p> : null}

      <dl>
        {exercise.difficulty !== null ? (
          <Detail label="Difficulty" value={`${exercise.difficulty} / 10`} />
        ) : null}
        {exercise.targeted_muscles.length > 0 ? (
          <Detail label="Muscles" value={exercise.targeted_muscles.join(", ")} />
        ) : null}
        {exercise.required_equipment.length > 0 ? (
          <Detail
            label="Equipment"
            value={exercise.required_equipment.join(", ")}
          />
        ) : null}
      </dl>

      {exercise.instructions ? (
        <>
          <h2>How to perform</h2>
          <p style={{ whiteSpace: "pre-line" }}>{exercise.instructions}</p>
        </>
      ) : null}

      <StringList title="Precautions" items={exercise.precautions} />
      <RelatedList title="Variations" items={exercise.variations} />
      <RelatedList title="Alternatives" items={exercise.alternatives} />

      <p style={{ marginTop: "1.5rem" }}>
        <Link href={`/exercises/${exercise.id}/progress`}>
          View your progress on this exercise →
        </Link>
      </p>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <dt style={{ fontWeight: 600, minWidth: "6rem" }}>{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}

function StringList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h2>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

function RelatedList({
  title,
  items,
}: {
  title: string;
  items: RelatedExerciseSummary[];
}) {
  if (items.length === 0) return null;
  return (
    <>
      <h2>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/exercises/${item.id}`}>{item.name}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export type { ExerciseDetail };
