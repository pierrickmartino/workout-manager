import { notFound } from "next/navigation";

import { resolveIsAdmin } from "@/lib/admin";
import { fetchAdminExercises } from "@/lib/admin-exercises";
import { AdminExerciseBrowser } from "@/components/AdminExerciseBrowser";
import { CatalogCompletenessBreakdown } from "@/components/CatalogCompletenessBreakdown";
import { EnrichmentBackfillControl } from "@/components/EnrichmentBackfillControl";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";

// The admin catalog browser (issue #501, ADR-0075/0076): a read-only ops view of the whole
// shared Catalog. Unlike the user-facing library it hides nothing — every Provenance and
// Completeness tier (Stubs included) and both retired and active rows — and it names the
// internal Catalog Completeness tier and the retired tombstone, the signals deliberately
// kept off the public catalog. The admin gate is resolved server-side; a non-admin gets a
// 404 rather than a revealed-but-denied page, and the backend independently gates the feed
// (`require_admin`, ADR-0046). The whole bounded catalog is fetched server-side (the JWT
// never reaches the browser); the client component handles search, the facets, and the
// links toward the editor from there.
//
// The corpus-wide enrichment tools live here too (issue #508): the catalog-health completeness
// breakdown and the whole-catalog Stub-enrichment backfill trigger, relocated from the admin
// home so that per-Exercise enrich-now (on the editor) and these corpus-wide controls sit in
// one place — the admin exercise area. Both remain admin-gated on the backend (ADR-0046).
export default async function AdminExercisesPage() {
  const isAdmin = await resolveIsAdmin();
  if (!isAdmin) notFound();

  const result = await fetchAdminExercises();

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // ADMIN" title="Exercise catalog" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        The whole shared catalog as an ops view — every movement regardless of provenance,
        including name-only stubs and retired entries, with its completeness tier. Filter by
        provenance, completeness, or status, or search by name.
      </p>

      {result.success && result.data ? (
        <AdminExerciseBrowser rows={result.data} />
      ) : (
        <Alert tone="error">
          Could not load the catalog: {result.error ?? "unknown error"}
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        <SectionHeader>Catalog enrichment</SectionHeader>
        <Card className="p-4">
          <div className="flex flex-col gap-6">
            <CatalogCompletenessBreakdown />
            <EnrichmentBackfillControl />
          </div>
        </Card>
      </div>

      <BackLink href="/admin">Back to admin</BackLink>
    </section>
  );
}
