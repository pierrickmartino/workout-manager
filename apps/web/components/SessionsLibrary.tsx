"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";

import {
  filterSessions,
  hasActiveSessionFilters,
  type SessionSummary,
} from "@/lib/session-library";
import { GENERIC_AUTHOR_LABEL } from "@/lib/session-author";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// The interactive My Sessions library (CONTEXT: My Sessions, issue #397): search over the
// user's own standalone Sessions and a favorites-only toggle. Filtering is entirely
// client-side over the already-fetched library (like History) — the filter state lives in
// React and every keystroke re-filters in-browser, never re-fetching. All matching lives in
// the `session-library` view-model; this component only wires the controls to it.
export function SessionsLibrary({
  sessions,
}: {
  sessions: SessionSummary[];
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const filters = useMemo(
    () => ({ query, favoritesOnly }),
    [query, favoritesOnly],
  );
  const filtered = useMemo(
    () => filterSessions(sessions, filters),
    [sessions, filters],
  );
  const active = hasActiveSessionFilters(filters);

  function clear(): void {
    setQuery("");
    setFavoritesOnly(false);
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

        <div className="flex flex-wrap items-center gap-2">
          {/* The favorites-only filter (CONTEXT: Favorite) — combines with the search. */}
          <button
            type="button"
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((on) => !on)}
            className={cn(
              "label-mono inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none",
              favoritesOnly
                ? "border-cyan/40 bg-cyan-dim text-cyan"
                : "border-border text-text-secondary hover:border-cyan hover:text-cyan",
            )}
          >
            <Star
              className={cn("h-3 w-3", favoritesOnly && "fill-current")}
              aria-hidden
            />
            Favorites only
          </button>

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
              <SessionRow session={session} />
            </li>
          ))}
        </ol>
      )}

      <BackLink href="/train">Back to train</BackLink>
    </section>
  );
}

function SessionRow({
  session,
}: {
  session: SessionSummary;
}): React.JSX.Element {
  // The Author credit, with the same never-blank generic fallback the Session detail uses
  // (a null/blank raw name → the generic label), so a row is never authored by "".
  const authorName =
    session.author.display_name?.trim() || GENERIC_AUTHOR_LABEL;

  return (
    <Link href={`/sessions/${session.id}`} className="block">
      <Card className="flex flex-col gap-3 p-5 transition-colors hover:border-cyan/40">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {session.display_name}
          </h2>
          {/* The Favorite marker, shown only when set — a quiet indicator, not a control
              (marking/unmarking lives on the Session detail). */}
          {session.is_favorite ? (
            <Star
              className="mt-1 h-4 w-4 shrink-0 fill-cyan text-cyan"
              aria-label="Favorited"
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="cyan" className="capitalize">
            {session.training_type}
          </Badge>
          <span className="label-mono text-[10px] text-text-muted">
            by {authorName}
          </span>
        </div>
      </Card>
    </Link>
  );
}
