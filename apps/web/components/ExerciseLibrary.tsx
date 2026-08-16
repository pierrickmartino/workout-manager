"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";

import { searchExerciseLibrary } from "@/app/protocols/[id]/edit/actions";
import type { ExerciseSearchResult } from "@/lib/exercises-types";
import { createOffer } from "@/lib/exercise-picker";
import { formatMuscleSummary } from "@/lib/exercise-muscle-summary";
import type { PickedExercise } from "@/lib/protocol-builder";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompletenessBadge } from "@/components/exercise/completeness-badge";

interface ExerciseLibraryProps {
  onPick: (exercise: PickedExercise) => void;
  // Opt-in search-and-create (ADR-0033). When provided, a catalog miss offers to mint the
  // typed movement as a `user_entered` Exercise; the callback resolves-or-creates it and
  // returns a user-safe error on failure. Omitted (the Protocol Builder), the library
  // stays strictly pick-only (ADR-0021).
  onCreate?: (name: string) => Promise<{ error: string | null }>;
}

// How long to wait after the last keystroke before searching, so typing a name
// does not fire a request per character.
const SEARCH_DEBOUNCE_MS = 250;

// The Exercise Library browser (Module I, ADR-0021). The user searches the shared
// catalog by name and picks a movement to add as a new Prescription (ADD EXERCISE).
// Provenance is surfaced on each result exactly as the Session view and Exercise Detail
// do. By default it is pick-only: a movement absent from the catalog is simply not found,
// never silently created. Passing `onCreate` opts into search-and-create (ADR-0033) for
// surfaces that must never be blocked by a catalog gap — e.g. the Hand-Authored Session
// build-and-log screen (issue #288): a catalog miss then offers to mint the typed
// movement as a `user_entered` Exercise, which is added to the workout like a catalog
// pick.
export function ExerciseLibrary({ onPick, onCreate }: ExerciseLibraryProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExerciseSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, startCreateTransition] = useTransition();
  // Track the latest query so a slow response for an earlier query cannot overwrite
  // the results of a newer one.
  const latestQuery = useRef("");

  useEffect(() => {
    const trimmed = query.trim();
    latestQuery.current = trimmed;
    setCreateError(null);
    if (trimmed === "") {
      setResults([]);
      setError(null);
      setSearched(false);
      return;
    }
    const handle = setTimeout(() => {
      startTransition(async () => {
        const outcome = await searchExerciseLibrary(trimmed);
        if (latestQuery.current !== trimmed) return; // a newer search superseded us
        setError(outcome.error);
        setResults(outcome.results);
        setSearched(true);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  // Whether to offer minting the typed movement, decided by the pure view-model once a
  // search has settled — never while typing or mid-request, so the affordance doesn't
  // flicker. Only computed when the surface opted into create (`onCreate`).
  const offer =
    onCreate && searched && !pending && !error
      ? createOffer(query, results)
      : ({ kind: "hidden" } as const);

  const create = (name: string) => {
    if (!onCreate) return;
    startCreateTransition(async () => {
      const outcome = await onCreate(name);
      if (outcome.error) {
        setCreateError(outcome.error);
        return;
      }
      // Minted and added to the workout — clear the search so the picker resets.
      setCreateError(null);
      setQuery("");
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">
          EXERCISE LIBRARY
        </span>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            value={query}
            placeholder="Search a movement…"
            aria-label="Search the Exercise Library"
            className="pl-9"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </label>

      {error ? (
        <p className="label-mono text-[10px] text-magenta">{error}</p>
      ) : null}

      {pending ? (
        <p className="label-mono text-[10px] text-text-muted">SEARCHING…</p>
      ) : null}

      {!pending && searched && results.length === 0 && !error && !onCreate ? (
        <p className="label-mono text-[10px] text-text-muted">
          NOT IN CATALOG — pick another movement
        </p>
      ) : null}

      {createError ? (
        <p className="label-mono text-[10px] text-magenta">{createError}</p>
      ) : null}

      {offer.kind === "offer" ? (
        <button
          type="button"
          onClick={() => create(offer.name)}
          disabled={creating}
          className="flex items-center gap-2 rounded-sm border border-dashed border-border bg-base p-2 text-left disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5 text-text-muted" aria-hidden />
          <span className="font-sans text-[13px] text-text-primary">
            {creating ? "Adding…" : `Create “${offer.name}”`}
          </span>
        </button>
      ) : null}

      {results.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {results.map((exercise) => (
            <li key={exercise.id}>
              <ExerciseResultRow
                exercise={exercise}
                onAdd={() => onPick({ id: exercise.id, name: exercise.name })}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface ExerciseResultRowProps {
  exercise: ExerciseSearchResult;
  onAdd: () => void;
}

function ExerciseResultRow({ exercise, onAdd }: ExerciseResultRowProps) {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-border bg-base p-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-sans text-[13px] text-text-primary">
            {exercise.name}
          </span>
          <ProvenanceBadge provenance={exercise.provenance} />
          <CompletenessBadge completeness={exercise.completeness} />
        </div>
        {exercise.targeted_muscles.length > 0 ? (
          <span className="truncate label-mono text-[9px] text-text-muted">
            {formatMuscleSummary(exercise.targeted_muscles)}
          </span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAdd}
        aria-label={`Add ${exercise.name}`}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        ADD
      </Button>
    </div>
  );
}

// Provenance surfaced exactly as the Session view and Exercise Detail do: an
// AI-invented entry is flagged as unvalidated; a reviewed one reads CURATED.
function ProvenanceBadge({ provenance }: { provenance: string }) {
  return provenance === "ai_generated" ? (
    <Badge variant="magenta" title="AI-generated, not yet reviewed">
      AI-GEN
    </Badge>
  ) : (
    <Badge variant="cyan">CURATED</Badge>
  );
}
