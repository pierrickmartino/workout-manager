import { notFound } from "next/navigation";

import { resolveIsAdmin } from "@/lib/admin";
import {
  fetchGenerationCalls,
  hasAuditLogFilters,
  parseAuditLogState,
  toAuditLogPager,
  toGenerationCallRowView,
  type AuditLogSearchParams,
} from "@/lib/admin-generation-calls";
import { GenerationCallFilters } from "@/components/GenerationCallFilters";
import { GenerationCallList } from "@/components/GenerationCallList";
import { GenerationCallPager } from "@/components/GenerationCallPager";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";

// The admin AI audit log (issue #730, ADR-0135): the metered Generation Calls of the last 3
// days, newest first, for investigating a user report or a failed generation. The operator
// narrows it by kind, outcome and user, and pages through it (issue #732); that state lives
// in the URL, parsed by the `admin-generation-calls-query` view-model. The admin gate is
// resolved server-side; a non-admin gets a 404 rather than a revealed-but-denied page, and the
// backend independently gates the feed (`require_admin`, ADR-0046). Data is fetched
// server-side, so the JWT never reaches the browser.
export default async function AdminAiAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<AuditLogSearchParams>;
}) {
  const isAdmin = await resolveIsAdmin();
  if (!isAdmin) notFound();

  const state = parseAuditLogState(await searchParams);
  const isFiltered = hasAuditLogFilters(state.filters);
  const result = await fetchGenerationCalls(state);
  const pager = result.meta ? toAuditLogPager(state, result.meta) : null;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // ADMIN" title="AI audit log" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Every request that reached the AI provider in the last 3 days, newest first, whether
        it succeeded or failed. Cached results are not listed.
      </p>

      {/* Keyed on the URL’s filters, so the uncontrolled fields reseed after a navigation. */}
      <GenerationCallFilters
        key={JSON.stringify(state.filters)}
        filters={state.filters}
        isFiltered={isFiltered}
      />

      {result.success && result.data ? (
        <>
          <GenerationCallList
            calls={result.data.map(toGenerationCallRowView)}
            isFiltered={isFiltered}
          />
          {pager ? <GenerationCallPager pager={pager} /> : null}
        </>
      ) : (
        <Alert tone="error">
          Could not load the AI audit log: {result.error ?? "unknown error"}
        </Alert>
      )}

      <BackLink href="/admin">Back to admin</BackLink>
    </section>
  );
}
