// Pure view-model, filter predicate, and sort for the admin catalog browser (issue #501,
// ADR-0075/0076). Frontend logic lives here per the repo rule so it is unit-testable with
// `node --test` and the component stays thin. No server or React imports.
//
// This is the operator-only ops view: unlike the user-facing library it names the internal
// Catalog Completeness tier (Stub | Listable | Enriched) and surfaces the retired tombstone,
// both hidden from the public catalog. The backend already spans the whole Catalog and
// orders it; this layer re-filters and re-sorts client-side so search and the three facets
// respond instantly without a round-trip.

// One admin browser row exactly as the backend endpoint returns it (the wire shape).
export interface AdminExerciseRow {
  id: number;
  name: string;
  provenance: string;
  completeness: string;
  retired: boolean;
}

// The active/retired facet: `all` spans both (the default ops view hides nothing).
export type AdminExerciseStatus = "all" | "active" | "retired";

// The browser's filter state. A blank `query`, `provenance`, or `completeness` means "no
// filter on that axis"; `status` narrows retired/active. These compose (AND'd), mirroring
// the backend's `AdminBrowseFilters`.
export interface AdminExerciseFilters {
  query: string;
  provenance: string;
  completeness: string;
  status: AdminExerciseStatus;
}

// The starting, unfiltered state — the whole Catalog, hiding nothing.
export const EMPTY_ADMIN_FILTERS: AdminExerciseFilters = {
  query: "",
  provenance: "",
  completeness: "",
  status: "all",
};

// One row projected for display: the raw axes plus human labels, a retired flag, a status
// label, and the href toward the (later) editor.
export interface AdminExerciseRowView {
  id: number;
  name: string;
  href: string;
  provenance: string;
  provenanceLabel: string;
  completeness: string;
  completenessLabel: string;
  retired: boolean;
  statusLabel: string;
}

// Provenance is a closed set (CONTEXT: Provenance); the ops labels read as the rest of the
// UI surfaces them. An unknown token falls back to itself so a future value still renders.
const PROVENANCE_LABELS: Record<string, string> = {
  curated: "Curated",
  ai_generated: "AI-generated",
  user_entered: "User-entered",
};

// Catalog Completeness tiers (ADR-0041) — the internal/ops axis, named only here behind
// the admin gate, never on a user-facing surface.
const COMPLETENESS_LABELS: Record<string, string> = {
  stub: "Stub",
  listable: "Listable",
  enriched: "Enriched",
};

export function provenanceLabel(value: string): string {
  return PROVENANCE_LABELS[value] ?? value;
}

export function completenessLabel(value: string): string {
  return COMPLETENESS_LABELS[value] ?? value;
}

// The editor href a row links toward (the editor lands in a later issue).
export function adminExerciseHref(id: number): string {
  return `/admin/exercises/${id}`;
}

// Project one wire row onto its display view-model. Pure: it derives labels and the href
// and never mutates the input.
export function toAdminExerciseRowView(
  row: AdminExerciseRow,
): AdminExerciseRowView {
  return {
    id: row.id,
    name: row.name,
    href: adminExerciseHref(row.id),
    provenance: row.provenance,
    provenanceLabel: provenanceLabel(row.provenance),
    completeness: row.completeness,
    completenessLabel: completenessLabel(row.completeness),
    retired: row.retired,
    statusLabel: row.retired ? "Retired" : "Active",
  };
}

// Whether a row passes every active filter (AND semantics). A blank query/provenance/
// completeness skips that axis; `status` narrows retired/active. The name match is
// case-insensitive and trimmed — the client twin of the backend's normalized substring.
export function matchesAdminFilters(
  row: AdminExerciseRow,
  filters: AdminExerciseFilters,
): boolean {
  const query = filters.query.trim().toLowerCase();
  if (query && !row.name.toLowerCase().includes(query)) return false;
  if (filters.provenance && row.provenance !== filters.provenance) return false;
  if (filters.completeness && row.completeness !== filters.completeness) return false;
  if (filters.status === "active" && row.retired) return false;
  if (filters.status === "retired" && !row.retired) return false;
  return true;
}

// Filter rows by the composable predicate, returning a fresh array (never mutating input).
export function filterAdminExercises(
  rows: readonly AdminExerciseRow[],
  filters: AdminExerciseFilters,
): AdminExerciseRow[] {
  return rows.filter((row) => matchesAdminFilters(row, filters));
}

// Order rows A→Z by name, case-insensitively, with a stable id tiebreak so two movements
// sharing a name never reorder run-to-run. Pure: returns a fresh, sorted array.
export function sortAdminExercises(
  rows: readonly AdminExerciseRow[],
): AdminExerciseRow[] {
  return [...rows].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    return byName !== 0 ? byName : a.id - b.id;
  });
}

// The one call the thin component makes: filter, sort, then project to display rows.
export function selectAdminExerciseRows(
  rows: readonly AdminExerciseRow[],
  filters: AdminExerciseFilters,
): AdminExerciseRowView[] {
  return sortAdminExercises(filterAdminExercises(rows, filters)).map(
    toAdminExerciseRowView,
  );
}

// Whether any filter is active — drives the "showing the whole catalog" vs "N of M" copy
// and the "Clear filters" affordance.
export function hasActiveAdminFilters(filters: AdminExerciseFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.provenance !== "" ||
    filters.completeness !== "" ||
    filters.status !== "all"
  );
}
