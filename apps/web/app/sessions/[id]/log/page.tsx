import { notFound } from "next/navigation";

import { LogSessionForm } from "@/components/LogSessionForm";
import { fetchSession } from "@/lib/sessions";
import { resolveAppearance } from "@/lib/appearance";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";

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

  const [envelope, appearance] = await Promise.all([
    fetchSession(sessionId),
    resolveAppearance(),
  ]);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const session = envelope.data;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // LOG"
        title={
          <span className="capitalize">Log {session.training_type} session</span>
        }
      />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Record what you actually performed.
      </p>

      <LogSessionForm
        sessionId={session.id}
        prescriptions={session.prescriptions}
        today={today}
        unit={appearance.weight_unit}
      />

      <BackLink href={`/sessions/${session.id}`}>Back to session</BackLink>
    </section>
  );
}
