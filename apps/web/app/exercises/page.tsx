import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { ExerciseCatalogBrowser } from "@/components/ExerciseCatalogBrowser";
import { FieldGuidePrototype } from "@/components/exercise-fieldguide-prototype/field-guide-prototype";
import { FIELD_GUIDE_KEYS } from "@/components/exercise-fieldguide-prototype/variant-catalog";
import {
  browseCatalog,
  fetchCatalogFacets,
  fetchExerciseUsage,
} from "@/lib/exercise-browse";
import { CATALOG_PAGE_SIZE } from "@/lib/exercise-browse-types";
import { parseCatalogFilters, type RawSearchParams } from "@/lib/exercise-browse-query";
import { fetchProfile } from "@/lib/profile";
import { resolveAppearance } from "@/lib/appearance";

// PROTOTYPE HOOK (throwaway, gated behind ?variant=). When the URL carries a valid
// ?variant= key the "Field Guide" discovery prototype renders in place of the production
// browser; without it, or in any production build, the page is exactly as it was. The
// floating switcher (hidden in production builds) cycles the variants. See
// components/exercise-fieldguide-prototype/README.md.
function resolvePrototypeVariant(raw: RawSearchParams): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const value = raw.variant;
  const key = Array.isArray(value) ? value[0] : value;
  return key && FIELD_GUIDE_KEYS.has(key) ? key : null;
}

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
  const raw = await searchParams;
  const filters = parseCatalogFilters(raw);
  const prototypeVariant = resolvePrototypeVariant(raw);

  const [pageEnvelope, facetsEnvelope, usageEnvelope, profileEnvelope] =
    await Promise.all([
      browseCatalog(filters, { limit: CATALOG_PAGE_SIZE, offset: 0 }),
      fetchCatalogFacets(),
      fetchExerciseUsage(),
      fetchProfile(),
    ]);

  // The prototype's Details panel needs the reader's Weight Unit; the production browser
  // does not. Fetch it only on the prototype path so the shipped page is untouched.
  const appearance = prototypeVariant ? await resolveAppearance() : null;

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
        difficulty — or search by name — and open any exercise for its full details.
      </p>

      {pageEnvelope.success && pageEnvelope.data ? (
        prototypeVariant ? (
          <FieldGuidePrototype
            variant={prototypeVariant}
            initialFilters={filters}
            initialResults={pageEnvelope.data}
            initialTotal={pageEnvelope.meta?.total ?? pageEnvelope.data.length}
            equipmentOptions={equipmentOptions}
            myEquipment={myEquipment}
            unit={appearance?.weight_unit ?? "kg"}
          />
        ) : (
          <ExerciseCatalogBrowser
            initialFilters={filters}
            initialResults={pageEnvelope.data}
            initialTotal={pageEnvelope.meta?.total ?? pageEnvelope.data.length}
            equipmentOptions={equipmentOptions}
            myEquipment={myEquipment}
            usage={usage}
            referenceIso={referenceIso}
          />
        )
      ) : (
        <Alert tone="error">
          Could not load the catalog: {pageEnvelope.error ?? "unknown error"}
        </Alert>
      )}

      <BackLink href="/train">Back to train</BackLink>
    </section>
  );
}
