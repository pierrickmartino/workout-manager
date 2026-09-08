"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Dumbbell, Star } from "lucide-react";

import {
  ALL_SESSIONS_CHIP,
  availableTypeChips,
  filterSessions,
  hasActiveSessionFilters,
  isSameChip,
  sessionRowTitle,
  type SessionChipFilter,
  type SessionSummary,
} from "@/lib/session-library";
import { trainingTypeBadgeVariant } from "@/lib/training-type-badge";
import { GENERIC_AUTHOR_LABEL } from "@/lib/session-author";
import { loggedCountBadge } from "@/lib/session-delete";
import { DeleteSessionControl } from "@/components/DeleteSessionControl";
import {
  submitDeleteSessionRow,
  submitToggleFavorite,
  type ToggleFavoriteState,
} from "@/app/sessions/actions";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
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
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<SessionChipFilter>(ALL_SESSIONS_CHIP);

  const filters = useMemo(() => ({ query, chip }), [query, chip]);
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
              <SessionRow session={session} />
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

function SessionRow({
  session,
}: {
  session: SessionSummary;
}): React.JSX.Element {
  // The Author credit, with the same never-blank generic fallback the Session detail uses
  // (a null/blank raw name → the generic label), so a row is never authored by "".
  const authorName =
    session.author.display_name?.trim() || GENERIC_AUTHOR_LABEL;

  // The row title (CONTEXT: Session Name): the name when set, else the formatted creation date
  // — the Training Type is NOT repeated here, it lives on the badge (Q5).
  const title = sessionRowTitle(session);

  // The Logged Count signal (CONTEXT: Logged Count, ADR-0063): the "Trained N×" label when the
  // Session has been performed (≥ 1), else `null`. It and the Delete control are mutually
  // exclusive — a performed row shows the label (and is undeletable), an unperformed row shows
  // Delete.
  const loggedBadge = loggedCountBadge(session.logged_count);

  return (
    <Card className="flex flex-col gap-3 p-5 transition-colors hover:border-cyan/40">
      <div className="flex items-start gap-3">
        {/* The inline Favorite toggle (CONTEXT: Favorite) — interactive, so it sits OUTSIDE the
            navigation link. */}
        <FavoriteToggle session={session} />

        {/* The navigation link wraps only the textual content — the toggle above and the
            Delete control below are interactive and must not nest inside an anchor. */}
        <Link
          href={`/sessions/${session.id}`}
          className="flex flex-1 items-start justify-between gap-3 focus-visible:outline-none"
        >
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {/* The Training Type badge, colored per type (Q9) — the one place the type appears. */}
            <Badge
              variant={trainingTypeBadgeVariant(session.training_type)}
              className="capitalize"
            >
              {session.training_type}
            </Badge>
            <span className="label-mono text-[10px] text-text-muted">
              by {authorName}
            </span>
          </div>
        </Link>
      </div>

      {/* The fact row: the plan's Exercise Prescription count (always) and, on the right, the
          Logged Count label when performed (so it is spotted at a glance and its Delete is
          withheld), else the Delete control. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="label-mono inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
          <Dumbbell className="h-3.5 w-3.5 text-text-muted" aria-hidden />
          {session.exercise_count}{" "}
          {session.exercise_count === 1 ? "exercise" : "exercises"}
        </span>
        {loggedBadge ? (
          <Badge
            variant="muted"
            className="uppercase"
            title="Logged performances of this session"
          >
            {loggedBadge}
          </Badge>
        ) : (
          <DeleteSessionControl
            sessionId={session.id}
            action={submitDeleteSessionRow}
            confirmPrompt="Delete?"
          />
        )}
      </div>
    </Card>
  );
}

// The inline Favorite star toggle for one row (CONTEXT: Favorite, #396). A one-button form
// posting to `submitToggleFavorite`: the hidden `favorite` field carries the *target* state
// (the opposite of the current marker), so the server marks or unmarks and revalidates
// `/sessions`. The button reflects the current state (filled star + `aria-pressed`); while the
// action is in flight it is disabled. A failure surfaces the returned error inline.
function FavoriteToggle({
  session,
}: {
  session: SessionSummary;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<
    ToggleFavoriteState,
    FormData
  >(submitToggleFavorite, { error: null });

  const label = session.is_favorite ? "Unfavorite session" : "Favorite session";

  return (
    <form action={formAction} className="mt-0.5 shrink-0">
      <input type="hidden" name="session_id" value={session.id} />
      {/* The target state: mark when currently unfavorited, unmark when currently favorited. */}
      <input
        type="hidden"
        name="favorite"
        value={session.is_favorite ? "false" : "true"}
      />
      <button
        type="submit"
        aria-pressed={session.is_favorite}
        aria-label={label}
        title={state.error ?? label}
        disabled={pending}
        className={cn(
          "rounded-sm p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 disabled:opacity-50 motion-reduce:transition-none",
          session.is_favorite
            ? "text-cyan"
            : "text-text-muted hover:text-cyan",
        )}
      >
        <Star
          className={cn("h-4 w-4", session.is_favorite && "fill-cyan")}
          aria-hidden
        />
      </button>
    </form>
  );
}
