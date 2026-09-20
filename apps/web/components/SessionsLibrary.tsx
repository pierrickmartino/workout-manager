"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Star } from "lucide-react";

import {
  ALL_SESSIONS_CHIP,
  availableTypeChips,
  filterSessions,
  hasActiveSessionFilters,
  isSameChip,
  parseSessionFilters,
  sessionFiltersToQuery,
  type SessionChipFilter,
  type SessionSummary,
} from "@/lib/session-library";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { SessionLibraryRow } from "@/components/SessionLibraryRow";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// The interactive My Sessions library (CONTEXT: My Sessions, issue #397): search over the
// user's own standalone Sessions plus a single-select chip row (All / Favorites / one Training
// Type). Filtering is entirely client-side over the already-fetched library (like History) —
// the filter state lives in React and every keystroke or chip re-filters in-browser, never
// re-fetching. All matching lives in the `session-library` view-model; this component only
// wires the controls to it. Favoriting a row is the one write: a server action that revalidates.
export function SessionsLibrary({
  sessions,
}: {
  sessions: SessionSummary[];
}): React.JSX.Element {
  // Seed once from the URL, then own the state locally — a filter change re-filters the
  // already-fetched library in-browser and is mirrored back into the URL below, never
  // re-running the Server Component (the History pattern).
  const initialParams = useSearchParams();
  const [query, setQuery] = useState(
    () => parseSessionFilters(new URLSearchParams(initialParams.toString())).query,
  );
  const [chip, setChip] = useState<SessionChipFilter>(
    () => parseSessionFilters(new URLSearchParams(initialParams.toString())).chip,
  );

  const filters = useMemo(() => ({ query, chip }), [query, chip]);

  // Mirror the active filters into the shareable URL without a navigation, so a refresh or
  // shared link restores the narrowed view and Back from an opened Session returns to it.
  // `replaceState` (not a router push) keeps the Server Component and its one-shot library
  // fetch from re-running on a keystroke or chip tap.
  useEffect(() => {
    const search = sessionFiltersToQuery(filters).toString();
    const url = search.length > 0 ? `?${search}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [filters]);
  const filtered = useMemo(
    () => filterSessions(sessions, filters),
    [sessions, filters],
  );
  const active = hasActiveSessionFilters(filters);
  // Only Training Types actually present earn a chip — no dead "Yoga" chip in a strength-only
  // library. Derived from the whole library, not the filtered view, so a chip never vanishes
  // just because the current filter excluded every row of its type.
  const typeChips = useMemo(() => availableTypeChips(sessions), [sessions]);

  function clear(): void {
    setQuery("");
    setChip(ALL_SESSIONS_CHIP);
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // TRAIN"
        title="My sessions"
        action={
          // The filtered count with total context when a filter is active, else the plain
          // total — so a narrowed list never looks like a shrunken library.
          <Badge variant="muted">
            {active
              ? `${filtered.length} of ${sessions.length}`
              : sessions.length}{" "}
            SESSIONS
          </Badge>
        }
      />

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="sessions-search"
            className="label-mono text-[10px] text-text-muted"
          >
            SEARCH
          </label>
          {/* Case-insensitive substring over Session Name, the derived fallback label, and
              Training Type — the same rule the server filters by (parity via
              `session-library`). */}
          <Input
            id="sessions-search"
            type="search"
            placeholder="Search by name or type"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {/* The single-select chip row (CONTEXT: My Sessions): All / Favorites / one Training
            Type. It replaces the former standalone favorites toggle and combines (AND) with
            the search. Tapping the active chip returns to All. */}
        <div
          role="group"
          aria-label="Filter sessions"
          className="flex flex-wrap items-center gap-2"
        >
          <FilterChip
            label="All"
            active={isSameChip(chip, ALL_SESSIONS_CHIP)}
            onSelect={() => setChip(ALL_SESSIONS_CHIP)}
          />
          <FilterChip
            label="Favorites"
            icon={<Star className="h-3 w-3" aria-hidden />}
            active={isSameChip(chip, { kind: "favorites" })}
            onSelect={() =>
              setChip((current) =>
                isSameChip(current, { kind: "favorites" })
                  ? ALL_SESSIONS_CHIP
                  : { kind: "favorites" },
              )
            }
          />
          {typeChips.map((trainingType) => {
            const typeChip: SessionChipFilter = { kind: "type", trainingType };
            return (
              <FilterChip
                key={trainingType}
                label={trainingType}
                capitalize
                active={isSameChip(chip, typeChip)}
                onSelect={() =>
                  setChip((current) =>
                    isSameChip(current, typeChip) ? ALL_SESSIONS_CHIP : typeChip,
                  )
                }
              />
            );
          })}

          {active ? (
            <button
              type="button"
              onClick={clear}
              className="label-mono text-[11px] text-text-muted hover:text-cyan hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="font-sans text-sm text-text-secondary">
            No sessions match these filters.
          </p>
          <button
            type="button"
            onClick={clear}
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Clear filters
          </button>
        </Card>
      ) : (
        <ol className="flex list-none flex-col gap-4 p-0">
          {filtered.map((session) => (
            <li key={session.id}>
              <SessionLibraryRow session={session} />
            </li>
          ))}
        </ol>
      )}

      <BackLink href="/train">Back to train</BackLink>
    </section>
  );
}

// One chip in the filter row — a single-select pill styled like the former favorites toggle.
// `active` drives the selected (cyan) styling and `aria-pressed`; `capitalize` renders a
// lower-cased Training Type with a leading capital without mutating the value.
function FilterChip({
  label,
  active,
  onSelect,
  icon,
  capitalize = false,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  icon?: React.ReactNode;
  capitalize?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "label-mono inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none",
        capitalize && "capitalize",
        active
          ? "border-cyan/40 bg-cyan-dim text-cyan"
          : "border-border text-text-secondary hover:border-cyan hover:text-cyan",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
