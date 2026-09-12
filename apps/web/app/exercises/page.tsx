import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { ExerciseCatalogTaxonomy } from "@/components/ExerciseCatalogTaxonomy";
import {
  fetchCatalogTaxonomy,
  fetchCatalogFacets,
  fetchExerciseUsage,
} from "@/lib/exercise-browse";
import { parseCatalogFilters, type RawSearchParams } from "@/lib/exercise-browse-query";
import { fetchProfile } from "@/lib/profile";
import { resolveAppearance } from "@/lib/appearance";

// Browse the Catalog as a field-guide taxonomy (ADR-0072, over ADR-0042): a first-class,
// read-only destination to discover movements across the whole shared Catalog, grouped by
// broad Movement Pattern and faceted by Muscle Group / equipment / difficulty with a name
// search. Lives under the TRAIN section (the tab already lights up for /exercises). The
// grouped taxonomy, the facet options, the user's usage map, their Default Equipment, and
// their Weight Unit are read server-side in parallel; the client handles facet toggles,
// search, section collapse, and the Details drawer from there. A row opens a read-only
// detail drawer — browsing never edits a plan.
export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseCatalogFilters(await searchParams);

  const [
    taxonomyEnvelope,
    facetsEnvelope,
    usageEnvelope,
    profileEnvelope,
    appearance,
  ] = await Promise.all([
    fetchCatalogTaxonomy(filters),
    fetchCatalogFacets(),
    fetchExerciseUsage(),
    fetchProfile(),
    resolveAppearance(),
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
        Explore the whole exercise catalog — grouped by movement pattern like a field
        guide. Filter by muscle group, equipment, or difficulty, or search by name, and
        open any exercise for its full details.
      </p>

      {taxonomyEnvelope.success && taxonomyEnvelope.data ? (
        <ExerciseCatalogTaxonomy
          initialFilters={filters}
          initialTaxonomy={taxonomyEnvelope.data}
          equipmentOptions={equipmentOptions}
          myEquipment={myEquipment}
          usage={usage}
          referenceIso={referenceIso}
          unit={appearance.weight_unit}
        />
      ) : (
        <Alert tone="error">
          Could not load the catalog: {taxonomyEnvelope.error ?? "unknown error"}
        </Alert>
      )}

      <BackLink href="/train">Back to train</BackLink>
    </section>
  );
}
