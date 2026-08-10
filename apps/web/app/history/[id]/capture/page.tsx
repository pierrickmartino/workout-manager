import { notFound, redirect } from "next/navigation";

import { fetchLog } from "@/lib/logs";
import { fetchProfile } from "@/lib/profile";
import { captureSeedFromRecord } from "@/lib/capture-seed";
import { HandAuthoredSessionForm } from "@/components/HandAuthoredSessionForm";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";

interface CaptureLogPageProps {
  params: Promise<{ id: string }>;
}

// Capture a plan-less record into a reusable plan (ADR-0044). Loads the record server-side
// (owner-scoped: a record that is not the caller's 404s), folds it into the Hand-Authored
// builder's seed, and renders the builder in plan-only mode — pre-filled with what the user
// did, with the performed-sets half hidden, so they set rest/tempo/supersets and save a new
// standalone plan. A plan-backed record has a plan already, so Capture does not apply: it is
// sent to its detail page, where Duplicate (ADR-0043) is the reuse action instead.
export default async function CaptureLogPage({ params }: CaptureLogPageProps) {
  const { id } = await params;
  const logId = Number(id);
  if (!Number.isInteger(logId)) notFound();

  const envelope = await fetchLog(logId);
  if (!envelope.success || !envelope.data) notFound();

  const record = envelope.data;
  // Only a plan-less record is Captured; a plan-backed one reuses its plan via Duplicate.
  if (record.session_id !== null) redirect(`/history/${logId}`);

  const today = new Date().toISOString().slice(0, 10);

  // The Sensitive-Constraint gate (ADR-0023): a constrained user builds with Supersets
  // paused. An absent profile defaults to allowing them; the plan-only endpoint stays the
  // server-side backstop.
  const profileEnvelope = await fetchProfile();
  const hasSensitiveConstraint = profileEnvelope.data?.is_sensitive ?? false;

  const seed = captureSeedFromRecord(record);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // LOG" title="Save as reusable session" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        We&apos;ve pre-filled this from what you logged. Add the rest, tempo, and any
        supersets we couldn&apos;t know, then save it as a reusable workout. This
        won&apos;t change your original record.
      </p>

      <HandAuthoredSessionForm
        today={today}
        hasSensitiveConstraint={hasSensitiveConstraint}
        mode="planOnly"
        seed={seed}
      />

      <BackLink href={`/history/${logId}`}>Back to session</BackLink>
    </section>
  );
}
