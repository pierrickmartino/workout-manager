import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { ExerciseCatalogBrowser } from "@/components/ExerciseCatalogBrowser";
import {
  browseCatalog,
  fetchCatalogFacets,
  fetchExerciseUsage,
} from "@/lib/exercise-browse";
import { CATALOG_PAGE_SIZE } from "@/lib/exercise-browse-types";
import { parseCatalogFilters, type RawSearchParams } from "@/lib/exercise-browse-query";
import { fetchProfile } from "@/lib/profile";

// Browse the Catalog (ADR-0042): a first-class, read-only destination to discover
// movements across the whole shared Catalog, faceted by Muscle Group / equipment /
// difficulty with a name search. Lives under the TRAIN section (the tab already lights up
// for /exercises). The first page, the facet options, the user's usage map, and their
// Default Equipment are read server-side in parallel; the client browser handles facet
// toggles and "Load more" from there. A row opens the existing Exercise Detail — browsing
// never edits a plan.
export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseCatalogFilters(await searchParams);

  const [pageEnvelope, facetsEnvelope, usageEnvelope, profileEnvelope] =
    await Promise.all([
      browseCatalog(filters, { limit: CATALOG_PAGE_SIZE, offset: 0 }),
      fetchCatalogFacets(),
      fetchExerciseUsage(),
      fetchProfile(),
    ]);

  // Today as a date-only ISO string, so the descriptive recency reads relative to now.
  const referenceIso = new Date().toISOString().slice(0, 10);
  const equipmentOptions =
    facetsEnvelope.success && facetsEnvelope.data
      ? facetsEnvelope.data.equipment
      : [];
  const usage = usageEnvelope.success && usageEnvelope.data ? usageEnvelope.data : [];
  const myEquipment =
    profileEnvelope.success && profileEnvelope.data
      ? profileEnvelope.data.default_equipment
      : [];

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // CATALOG" title="Browse exercises" />
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Explore the whole exercise catalog. Filter by muscle group, equipment, or
        difficulty — or search by name — and open any movement for its full details.
      </p>

      {pageEnvelope.success && pageEnvelope.data ? (
        <ExerciseCatalogBrowser
          initialFilters={filters}
          initialResults={pageEnvelope.data}
          initialTotal={pageEnvelope.meta?.total ?? pageEnvelope.data.length}
          equipmentOptions={equipmentOptions}
          myEquipment={myEquipment}
          usage={usage}
          referenceIso={referenceIso}
        />
      ) : (
        <Alert tone="error">
          Could not load the catalog: {pageEnvelope.error ?? "unknown error"}
        </Alert>
      )}

      <BackLink href="/train">Back to train</BackLink>
    </section>
  );
}
