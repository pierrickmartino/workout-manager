import { notFound } from "next/navigation";

import { fetchProtocol } from "@/lib/protocols";
import { fetchProfile } from "@/lib/profile";
import type { PickedExercise } from "@/lib/protocol-builder";
import { ProtocolBuilder } from "@/components/ProtocolBuilder";

// The Protocol Builder page (Module I, ADR-0020). Entered from the Protocol detail
// screen, it opens a builder for a Protocol the user owns — the backend returns 404
// (→ notFound) for anyone else. Editing is staged client-side; nothing touches the
// live plan until DEPLOY PROTOCOL. When reached from F6's ADD TO PROTOCOL deep-link,
// `?queue=<id>&queueName=<name>` carries an Exercise queued for placement (ADR-0021).
export default async function ProtocolBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ queue?: string; queueName?: string }>;
}) {
  const { id } = await params;
  const protocolId = Number(id);
  if (!Number.isInteger(protocolId)) notFound();

  const envelope = await fetchProtocol(protocolId);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  // The Sensitive-Constraint gate (ADR-0023): a user with any Sensitive Constraint
  // opens the builder with Supersets auto-unlinked and a banner. The derived
  // `is_sensitive` flag comes from the Profile; a failed read defaults to allowing
  // Supersets (DEPLOY remains the server-side backstop).
  const profileEnvelope = await fetchProfile();
  const hasSensitiveConstraint = profileEnvelope.data?.is_sensitive ?? false;

  const { queue, queueName } = await searchParams;
  const queuedExercise = toQueuedExercise(queue, queueName);

  return (
    <ProtocolBuilder
      protocol={envelope.data}
      queuedExercise={queuedExercise}
      hasSensitiveConstraint={hasSensitiveConstraint}
    />
  );
}

// Read the F6 deep-link's queued Exercise off the query string. A malformed or
// missing `queue` yields no queued Exercise — the builder simply opens for editing.
function toQueuedExercise(
  queue: string | undefined,
  queueName: string | undefined,
): PickedExercise | null {
  if (!queue) return null;
  const id = Number(queue);
  if (!Number.isInteger(id)) return null;
  return { id, name: queueName?.trim() ? queueName : `Exercise ${id}` };
}
