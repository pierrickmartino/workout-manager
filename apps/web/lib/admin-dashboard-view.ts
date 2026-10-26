// Pure view-model for the admin home dashboard (spec #767, ADR-0142): it turns the reads the
// admin home already makes into groups of summary tiles. Every number is a read-time projection
// over data that already exists (ADR-0018/0019) — nothing here is stored or counted on write.
// No server or React imports, so it is unit-testable with `node --test`.
//
// The dashboard is a list of tile **groups**, each with its own `ready` / `empty` / `failed`
// state, so one failed read darkens only its own group (per-group failure isolation). The
// catalog group is built here; a further group (the AI group, #769) is one more builder whose
// result joins `groups`, with no change to how the existing group is computed or rendered.

import {
  summarizeCompletenessBreakdown,
  type CompletenessBreakdown,
} from "./catalog-completeness-breakdown-view.ts";
import {
  adminFiltersToQuery,
  EMPTY_ADMIN_FILTERS,
  type AdminExerciseFilters,
  type AdminExerciseRow,
} from "./admin-exercises-view.ts";

// One read as the page hands it over: the backend envelope's shape, structurally (naming
// `Envelope` would drag the server-only transport into this module), or `null` when the read
// rejected outright (a transport failure the data module caught).
export interface DashboardRead<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error?: string | null;
}

// One tile: a single link whose accessible name is its label and value. `footnote` qualifies
// the value (e.g. a total that is only a floor) and is absent when there is nothing to say.
export interface DashboardTileView {
  key: string;
  label: string;
  value: string;
  footnote?: string;
  href: string;
}

export type DashboardGroupKey = "catalog";

// A group's three states. `empty` still carries its tiles — each reading "—" and still a link
// — so the row keeps its shape; `failed` carries only the message for an inline `Alert`.
export type DashboardGroupView =
  | { key: DashboardGroupKey; title: string; state: "ready"; tiles: DashboardTileView[] }
  | {
      key: DashboardGroupKey;
      title: string;
      state: "empty";
      tiles: DashboardTileView[];
      message: string;
    }
  | { key: DashboardGroupKey; title: string; state: "failed"; message: string };

export interface AdminDashboardInputs {
  completeness: DashboardRead<CompletenessBreakdown> | null;
  catalog: DashboardRead<AdminExerciseRow[]> | null;
}

export interface AdminDashboardView {
  groups: DashboardGroupView[];
}

const CATALOG_PATH = "/admin/exercises";

// The catalog URL for a filter state, through the catalog's own serializer (ADR-0100), so a
// tile's link is exactly the URL the catalog would write for that filter.
function catalogHref(filters: Partial<AdminExerciseFilters> = {}): string {
  const query = adminFiltersToQuery({ ...EMPTY_ADMIN_FILTERS, ...filters }).toString();
  return query === "" ? CATALOG_PATH : `${CATALOG_PATH}?${query}`;
}

// What a tile shows when its group has no data to summarize: a dash, never a 0 that reads as
// a measured result (an empty catalog is not "0% Enriched").
export const NO_VALUE = "—";

// "health", so the tiles' heading never duplicates the CATALOG section that holds the nav row.
const CATALOG_TITLE = "Catalog health";
const EMPTY_CATALOG_MESSAGE = "The catalog has no Exercises yet, so there is nothing to summarize.";

interface CatalogFigures {
  total: string;
  enriched: string;
  stub: string;
  retired: string;
}

// The four catalog tiles, in reading order, for a given set of formatted figures. The links
// are the same whatever the figures, so an empty group's tiles still lead into the catalog.
function catalogTiles(figures: CatalogFigures): DashboardTileView[] {
  return [
    { key: "total", label: "Total Exercises", value: figures.total, href: catalogHref() },
    { key: "enriched", label: "% Enriched", value: figures.enriched, href: catalogHref() },
    {
      key: "stub",
      label: "Stubs",
      value: figures.stub,
      href: catalogHref({ completeness: "stub" }),
    },
    {
      key: "retired",
      label: "Retired",
      value: figures.retired,
      href: catalogHref({ status: "retired" }),
    },
  ];
}

function catalogGroup(
  completeness: CompletenessBreakdown,
  rows: AdminExerciseRow[],
): DashboardGroupView {
  // % Enriched is the completeness readout's own share, not a second calculation of it.
  const summary = summarizeCompletenessBreakdown(completeness);
  if (summary.isEmpty) {
    return {
      key: "catalog",
      title: CATALOG_TITLE,
      state: "empty",
      tiles: catalogTiles({ total: NO_VALUE, enriched: NO_VALUE, stub: NO_VALUE, retired: NO_VALUE }),
      message: EMPTY_CATALOG_MESSAGE,
    };
  }
  const retired = rows.filter((row) => row.retired).length;
  return {
    key: "catalog",
    title: CATALOG_TITLE,
    state: "ready",
    tiles: catalogTiles({
      total: String(summary.total),
      enriched: `${summary.enrichedPercent}%`,
      stub: String(completeness.stub),
      retired: String(retired),
    }),
  };
}

// The reason a read failed, or `null` when it succeeded with a payload. A rejection (`null`),
// a refused envelope and a successful envelope with no payload all mean "could not read this"
// — the same three shapes `best-effort-read.ts` funnels — so all three fail the group.
function readFailure<T>(read: DashboardRead<T> | null): string | null {
  if (read && read.success && read.data != null) return null;
  return read?.error ?? "unknown error";
}

function failedGroup(key: DashboardGroupKey, title: string, reason: string): DashboardGroupView {
  return { key, title, state: "failed", message: `Could not load the ${key} summary: ${reason}` };
}

// The catalog group from its two reads. Either read failing fails the whole group — a Retired
// count beside a missing breakdown would be a half-truth — but never another group.
function catalogGroupFromReads(inputs: AdminDashboardInputs): DashboardGroupView {
  const reason = readFailure(inputs.completeness) ?? readFailure(inputs.catalog);
  if (reason !== null || !inputs.completeness?.data || !inputs.catalog?.data) {
    return failedGroup("catalog", CATALOG_TITLE, reason ?? "unknown error");
  }
  return catalogGroup(inputs.completeness.data, inputs.catalog.data);
}

// The whole dashboard. Each group is built from its own reads alone, which is what keeps a
// failure in one group from reaching another; a new group is one more entry here.
export function adminDashboardView(inputs: AdminDashboardInputs): AdminDashboardView {
  return { groups: [catalogGroupFromReads(inputs)] };
}
