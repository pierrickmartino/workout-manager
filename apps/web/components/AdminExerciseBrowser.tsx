"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "@/components/pulse/icons";

import {
  EMPTY_ADMIN_FILTERS,
  hasActiveAdminFilters,
  projectAdminExerciseRows,
  sortAdminExercises,
  type AdminExerciseFilters,
  type AdminExerciseRow,
  type AdminExerciseRowView,
} from "@/lib/admin-exercises-view";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

// The closed Provenance and Completeness vocabularies as the facet dropdowns offer them
// (CONTEXT: Provenance; ADR-0041). Kept here as UI options; the pure view-model owns the
// labels a row renders.
const PROVENANCE_OPTIONS = [
  { value: "curated", label: "Curated" },
  { value: "ai_generated", label: "AI-generated" },
  { value: "user_entered", label: "User-entered" },
];

const COMPLETENESS_OPTIONS = [
  { value: "stub", label: "Stub" },
  { value: "listable", label: "Listable" },
  { value: "enriched", label: "Enriched" },
];

const STATUS_OPTIONS: { value: AdminExerciseFilters["status"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "retired", label: "Retired" },
];

const PROVENANCE_BADGE: Record<string, "cyan" | "violet" | "muted"> = {
  curated: "cyan",
  ai_generated: "violet",
  user_entered: "muted",
};

// The admin catalog browser (issue #501, ADR-0075/0076): the operator-only ops view of the
// whole shared Catalog. It hides nothing — every Provenance and Completeness tier (Stubs
// included) and both retired and active rows — and names the internal Completeness tier and
// the retired tombstone, both absent from the user-facing catalog. A thin Client Component:
// it holds only the filter state and delegates all filter/sort/projection to the pure
// `sortAdminExercises` and `projectAdminExerciseRows` in `lib/`, so the logic is unit-tested
// without a browser. Each row links toward the editor. The backend is the real gate
// (`require_admin`).
//
// It holds the whole Catalog — one generous page, up to 500 rows — so the list is kept off the
// keystroke path in three ways (ADR-0097): the sort is hoisted out of the filter pass, the
// filter pass itself runs against `useDeferredValue` so a keystroke paints before the list
// does, and each row defers its own layout and paint until it is near the viewport.
export function AdminExerciseBrowser({
  rows,
}: {
  rows: AdminExerciseRow[];
}): React.JSX.Element {
  const [filters, setFilters] = useState<AdminExerciseFilters>(EMPTY_ADMIN_FILTERS);
  // The field follows the keystroke; the list follows the field. React renders the typed
  // character first and the re-filtered catalog in a second, interruptible pass, so a fast
  // typist is never waiting on 500 rows between characters.
  const deferredFilters = useDeferredValue(filters);

  // The order never depends on the filters, so the sort — 500 `localeCompare`s — happens once
  // per catalog rather than once per keystroke.
  const sorted = useMemo(() => sortAdminExercises(rows), [rows]);
  const views = useMemo(
    () => projectAdminExerciseRows(sorted, deferredFilters),
    [sorted, deferredFilters],
  );
  // Read off the deferred filters, not the live ones, so the summary row always describes the
  // list underneath it rather than the one being computed.
  const filtered = hasActiveAdminFilters(deferredFilters);

  function update<K extends keyof AdminExerciseFilters>(
    key: K,
    value: AdminExerciseFilters[K],
  ): void {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            type="search"
            value={filters.query}
            onChange={(event) => update("query", event.target.value)}
            placeholder="Search by name…"
            aria-label="Search catalog by name"
            className="pl-10"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FacetSelect
            label="Provenance"
            value={filters.provenance}
            onChange={(value) => update("provenance", value)}
            allLabel="All provenance"
            options={PROVENANCE_OPTIONS}
          />
          <FacetSelect
            label="Completeness"
            value={filters.completeness}
            onChange={(value) => update("completeness", value)}
            allLabel="All tiers"
            options={COMPLETENESS_OPTIONS}
          />
          <label className="flex flex-col gap-1.5">
            <span className="label-mono text-[11px] text-text-secondary">STATUS</span>
            <Select
              value={filters.status}
              aria-label="Filter by status"
              onChange={(event) =>
                update("status", event.target.value as AdminExerciseFilters["status"])
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-mono text-[12px] text-text-muted">
          {views.length === rows.length
            ? `${rows.length} movement${rows.length === 1 ? "" : "s"}`
            : `${views.length} of ${rows.length}`}
        </span>
        {filtered ? (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_ADMIN_FILTERS)}
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {views.length === 0 ? (
        <Card className="p-6">
          <p className="text-center font-mono text-[13px] text-text-muted">
            No movements match these filters.
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border-lite overflow-hidden p-0">
          {views.map((view) => (
            <AdminExerciseRowLink key={view.id} view={view} />
          ))}
        </Card>
      )}
    </div>
  );
}

function FacetSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono text-[11px] text-text-secondary">
        {label.toUpperCase()}
      </span>
      <Select
        value={value}
        aria-label={`Filter by ${label.toLowerCase()}`}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

function AdminExerciseRowLink({
  view,
}: {
  view: AdminExerciseRowView;
}): React.JSX.Element {
  return (
    <Link
      href={view.href}
      className="group list-row-defer flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-elevated/50"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate font-sans text-[15px] font-medium text-text-primary">
          {view.name}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={PROVENANCE_BADGE[view.provenance] ?? "muted"}>
            {view.provenanceLabel}
          </Badge>
          <Badge variant="outline">{view.completenessLabel}</Badge>
          {view.retired ? <Badge variant="magenta">Retired</Badge> : null}
        </div>
      </div>
      <ChevronRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-text-secondary"
      />
    </Link>
  );
}
