import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchProgram } from "@/lib/programs";
import type { ProgramProgress, ProgramSession } from "@/lib/programs-types";
import type { ExercisePrescription } from "@/lib/sessions-types";

// Displays a user-owned multi-week Program: its self-paced next Session and the
// full week-by-week schedule. Upcoming Sessions show the recommended load already
// progressed from the user's Logged Sets (ADR-0004); the backend returns 404
// (→ notFound) for anyone who does not own the Program.
export default async function ProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const programId = Number(id);
  if (!Number.isInteger(programId)) notFound();

  const envelope = await fetchProgram(programId);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const program = envelope.data;

  return (
    <section>
      <h1 style={{ textTransform: "capitalize" }}>
        {program.training_type} program
      </h1>
      <p style={{ textTransform: "capitalize" }}>{program.objective}</p>
      <p>
        {program.weeks} weeks · {program.completed_count} of{" "}
        {program.sessions.length} sessions done
      </p>

      <NextUp program={program} />

      <h2>Schedule</h2>
      <ol>
        {program.sessions.map((session) => (
          <li key={session.session_id} style={{ marginBottom: "1.5rem" }}>
            <SessionCard
              session={session}
              isNext={session.session_id === program.next_session?.session_id}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function NextUp({ program }: { program: ProgramProgress }) {
  if (program.next_session === null) {
    return <p>🎉 Program complete — every session has been logged.</p>;
  }
  const next = program.next_session;
  return (
    <div style={{ margin: "1rem 0" }}>
      <h2>Next up</h2>
      <SessionCard session={next} isNext />
    </div>
  );
}

function SessionCard({
  session,
  isNext,
}: {
  session: ProgramSession;
  isNext: boolean;
}) {
  return (
    <div
      style={{
        borderLeft: isNext ? "3px solid #2563eb" : "3px solid #e5e7eb",
        paddingLeft: "0.75rem",
      }}
    >
      <strong>
        Week {session.week}, Day {session.day}
        {session.title ? ` — ${session.title}` : ""}
      </strong>
      {isNext ? (
        <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#2563eb" }}>
          (next)
        </span>
      ) : null}
      <ul style={{ marginTop: "0.5rem" }}>
        {session.prescriptions.map((prescription) => (
          <li key={prescription.position}>
            <PrescriptionRow prescription={prescription} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrescriptionRow({
  prescription,
}: {
  prescription: ExercisePrescription;
}) {
  return (
    <span>
      <Link href={`/exercises/${prescription.exercise_id}`}>
        {prescription.exercise_name}
      </Link>{" "}
      — {prescription.sets} × {prescription.reps}
      {prescription.recommended_load
        ? ` @ ${prescription.recommended_load}`
        : ""}
    </span>
  );
}
