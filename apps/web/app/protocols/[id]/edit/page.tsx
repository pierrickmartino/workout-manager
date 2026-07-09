import { notFound } from "next/navigation";

import { fetchProtocol } from "@/lib/protocols";
import { ProtocolBuilder } from "@/components/ProtocolBuilder";

// The Protocol Builder page (Module I, ADR-0020). Entered from the Protocol detail
// screen, it opens a builder for a Protocol the user owns — the backend returns 404
// (→ notFound) for anyone else. Editing is staged client-side; nothing touches the
// live plan until DEPLOY PROTOCOL.
export default async function ProtocolBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const protocolId = Number(id);
  if (!Number.isInteger(protocolId)) notFound();

  const envelope = await fetchProtocol(protocolId);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  return <ProtocolBuilder protocol={envelope.data} />;
}
