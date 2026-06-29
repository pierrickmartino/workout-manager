import Link from "next/link";
import { notFound } from "next/navigation";

import { SubstituteButton } from "@/components/SubstituteButton";
import {
  fetchSession,
  type ExercisePrescription,
  type WorkoutSession,
} from "@/lib/sessions";

// Displays a generated standalone Session and its Exercise Prescriptions. The
// session is user-owned: the backend returns 404 (→ notFound) for anyone else.
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) notFound();

  const envelope = await fetchSession(sessionId);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const session = envelope.data;

  return (
    <section>
      <h1 style={{ textTransform: "capitalize" }}>
        {session.training_type} session
      </h1>
      <p>{session.duration_minutes} minutes</p>

      <ol>
        {session.prescriptions.map((prescription) => (
          <li key={prescription.position} style={{ marginBottom: "1rem" }}>
            <PrescriptionCard
              prescription={prescription}
              sessionId={session.id}
            />
          </li>
        ))}
      </ol>

      <p>
        <Link href={`/sessions/${session.id}/log`}>Log this session →</Link>
      </p>
      <p>
        <Link href="/sessions/new">Generate another →</Link>
      </p>
    </section>
  );
}

function PrescriptionCard({
  prescription,
  sessionId,
}: {
  prescription: ExercisePrescription;
  sessionId: number;
}) {
  return (
    <div>
      <strong>
        <Link href={`/exercises/${prescription.exercise_id}`}>
          {prescription.exercise_name}
        </Link>
      </strong>
      {prescription.provenance === "ai_generated" ? (
        <span
          title="AI-generated, not yet reviewed"
          style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#92400e" }}
        >
          (AI-generated)
        </span>
      ) : null}
      {prescription.exercise_description ? (
        <p style={{ margin: "0.25rem 0" }}>{prescription.exercise_description}</p>
      ) : null}
      <dl style={{ margin: 0 }}>
        <Detail label="Sets × reps" value={`${prescription.sets} × ${prescription.reps}`} />
        {prescription.recommended_load ? (
          <Detail label="Load" value={prescription.recommended_load} />
        ) : null}
        {prescription.rest_seconds !== null ? (
          <Detail label="Rest" value={`${prescription.rest_seconds}s`} />
        ) : null}
        {prescription.tempo ? (
          <Detail label="Tempo" value={prescription.tempo} />
        ) : null}
        {prescription.targeted_muscles.length > 0 ? (
          <Detail
            label="Muscles"
            value={prescription.targeted_muscles.join(", ")}
          />
        ) : null}
      </dl>
      <SubstituteButton sessionId={sessionId} position={prescription.position} />
    </div>
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

export type { WorkoutSession };
