import Link from "next/link";
import { notFound } from "next/navigation";

import { LogSessionForm } from "@/components/LogSessionForm";
import { fetchSession } from "@/lib/sessions";

// Records a performance of a user-owned Session. The session is fetched to
// pre-fill one logging row per prescribed Exercise; the backend returns 404
// (→ notFound) for anyone who does not own it.
export default async function LogSessionPage({
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
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section>
      <h1 style={{ textTransform: "capitalize" }}>Log {session.training_type} session</h1>
      <p>Record what you actually performed.</p>

      <LogSessionForm
        sessionId={session.id}
        prescriptions={session.prescriptions}
        today={today}
      />

      <p style={{ marginTop: "1rem" }}>
        <Link href={`/sessions/${session.id}`}>← Back to session</Link>
      </p>
    </section>
  );
}
