import { notFound } from "next/navigation";

import { fetchHistory } from "@/lib/logs";
import { correctionFieldsFromRecord } from "@/lib/log-correction";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { CorrectLogForm } from "@/components/CorrectLogForm";

interface EditLogPageProps {
  params: Promise<{ id: string }>;
}

// Correct a past Logged Session's contents (ADR-0034). Loads the user's history
// server-side (the JWT never reaches the browser), finds the record by id, and renders
// an edit form pre-filled with its current values. A record that is not the caller's is
// simply not in their history, so it 404s — the same ownership boundary the PUT enforces.
export default async function EditLogPage({ params }: EditLogPageProps) {
  const { id } = await params;
  const logId = Number(id);
  if (!Number.isInteger(logId)) notFound();

  const envelope = await fetchHistory();
  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // LOG" title="Correct a session" />
        <Alert tone="error">
          Could not load your history: {envelope.error ?? "unknown error"}
        </Alert>
        <BackLink href="/history">Back to history</BackLink>
      </section>
    );
  }

  const record = envelope.data.find((entry) => entry.id === logId);
  if (record === undefined) notFound();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // LOG"
        title="Correct a session"
      />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Fix what you actually did — the reps, load, date, or duration. Your stats
        recompute from the corrected record.
      </p>

      <CorrectLogForm
        logId={record.id}
        fields={correctionFieldsFromRecord(record)}
        today={today}
      />

      <BackLink href="/history">Back to history</BackLink>
    </section>
  );
}
