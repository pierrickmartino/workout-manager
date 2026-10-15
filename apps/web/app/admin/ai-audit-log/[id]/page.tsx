import { notFound } from "next/navigation";

import { resolveIsAdmin } from "@/lib/admin";
import {
  fetchGenerationCall,
  toGenerationCallDetailView,
} from "@/lib/admin-generation-calls";
import { GenerationCallDetailPanel } from "@/components/GenerationCallDetailPanel";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";

// One call on the admin AI audit log (issue #731, ADR-0135): its prompts, its output or why it
// failed, the requested schema and the token budget. The admin gate is resolved server-side; a
// non-admin gets a 404 rather than a revealed-but-denied page, and the backend independently
// gates the read (`require_admin`, ADR-0046). An unknown call and one past the 3-day window
// are both a 404. Data is fetched server-side, so the JWT never reaches the browser.
export default async function AdminAiAuditCallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const isAdmin = await resolveIsAdmin();
  if (!isAdmin) notFound();

  const { id } = await params;
  const callId = Number(id);
  if (!Number.isInteger(callId)) notFound();

  const envelope = await fetchGenerationCall(callId);
  if (!envelope.success || !envelope.data) notFound();

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // ADMIN" title="AI call" />
      <GenerationCallDetailPanel detail={toGenerationCallDetailView(envelope.data)} />
      <BackLink href="/admin/ai-audit-log">Back to AI audit log</BackLink>
    </section>
  );
}
