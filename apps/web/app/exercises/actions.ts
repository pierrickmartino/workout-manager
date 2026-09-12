"use server";

import { browseCatalog, fetchCatalogTaxonomy } from "@/lib/exercise-browse";
import {
  CATALOG_PAGE_SIZE,
  type CatalogFilters,
  type CatalogPageResult,
} from "@/lib/exercise-browse-types";
import type { CatalogTaxonomyResult } from "@/lib/exercise-taxonomy-types";

// The one Server Action behind the Browse-the-Catalog client (ADR-0042). It fetches a
// single page for the given filters and offset, so the client can re-fetch on a facet
// change (offset 0) and append on "Load more" (the running offset) without any per-
// keystroke navigation. The JWT-attaching read stays on the server; the client only ever
// holds already-unwrapped results.
export async function fetchCatalogPage(
  filters: CatalogFilters,
  offset: number,
): Promise<CatalogPageResult> {
  const envelope = await browseCatalog(filters, {
    limit: CATALOG_PAGE_SIZE,
    offset,
  });

  if (!envelope.success || !envelope.data) {
    return {
      results: [],
      total: 0,
      error: envelope.error ?? "Could not load exercises.",
    };
  }

  return {
    results: envelope.data,
    total: envelope.meta?.total ?? envelope.data.length,
    error: null,
  };
}

// The Server Action behind the field-guide taxonomy client (ADR-0072): it re-fetches the
// whole grouped Catalog for the given filters when a facet or the search changes, so the
// client re-groups without a per-keystroke navigation. The JWT-attaching read stays on the
// server; the client only ever holds already-unwrapped groups.
export async function fetchCatalogTaxonomyForFilters(
  filters: CatalogFilters,
): Promise<CatalogTaxonomyResult> {
  const envelope = await fetchCatalogTaxonomy(filters);

  if (!envelope.success || !envelope.data) {
    return {
      taxonomy: { groups: [], total: 0 },
      error: envelope.error ?? "Could not load the catalog.",
    };
  }

  return { taxonomy: envelope.data, error: null };
}
