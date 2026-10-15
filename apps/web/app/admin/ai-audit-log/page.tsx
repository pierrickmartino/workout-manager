import { notFound } from "next/navigation";

import { resolveIsAdmin } from "@/lib/admin";
import {
  fetchGenerationCalls,
  toGenerationCallRowView,
} from "@/lib/admin-generation-calls";
import { GenerationCallList } from "@/components/GenerationCallList";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";

// The admin AI audit log (issue #730, ADR-0135): the most recent metered Generation Calls,
// newest first, for investigating a user report or a failed generation. Calls are kept for 3
// days. The admin gate is resolved server-side; a non-admin gets a 404 rather than a
// revealed-but-denied page, and the backend independently gates the feed (`require_admin`,
// ADR-0046). Data is fetched server-side, so the JWT never reaches the browser.
export default async function AdminAiAuditLogPage() {
  const isAdmin = await resolveIsAdmin();
  if (!isAdmin) notFound();

  const result = await fetchGenerationCalls();

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // ADMIN" title="AI audit log" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Every request that reached the AI provider in the last 3 days, newest first, whether
        it succeeded or failed. Cached results are not listed.
      </p>

      {result.success && result.data ? (
        <GenerationCallList calls={result.data.map(toGenerationCallRowView)} />
      ) : (
        <Alert tone="error">
          Could not load the AI audit log: {result.error ?? "unknown error"}
        </Alert>
      )}

      <BackLink href="/admin">Back to admin</BackLink>
    </section>
  );
}
