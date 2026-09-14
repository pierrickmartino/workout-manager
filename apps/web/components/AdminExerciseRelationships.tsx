"use client";

import { useState, useTransition } from "react";

import {
  addRelationshipAction,
  removeRelationshipAction,
  searchLinkCandidatesAction,
} from "@/app/admin/exercises/actions";
import {
  groupRelationships,
  relationshipDirectionLabel,
  relationshipKindLabel,
  relationshipKindOptions,
  relationshipRemovalTarget,
  type ExerciseRelationship,
  type LinkCandidate,
  type RelationshipKind,
} from "@/lib/admin-exercise-relationships";
import { Alert } from "@/components/pulse/alert";
import { Field } from "@/components/pulse/field";
import { SectionHeader } from "@/components/pulse/section-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

// The relationship manager on the admin Exercise editor (issue #505, spec §5): an admin sees the
// movement's typed Variation/Alternative links in **both** directions, adds a new one, and
// removes one — the lookup-first candidates Substitution resolves over. A thin Client Component;
// the vocabulary, grouping, and removal-target logic live in the pure
// `lib/admin-exercise-relationships` (unit-tested without a browser). The backend is the real
// gate (`require_admin`) and it rejects self-links (422) and duplicates (409) and creates no
// reciprocal link — this only forwards values and re-renders from the list each write returns.
export function AdminExerciseRelationships({
  exerciseId,
  relationships,
}: {
  exerciseId: number;
  relationships: ExerciseRelationship[];
}): React.JSX.Element {
  const [rows, setRows] = useState(relationships);
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, startRemoving] = useTransition();

  const grouped = groupRelationships(rows);

  function remove(row: ExerciseRelationship): void {
    setError(null);
    const target = relationshipRemovalTarget(exerciseId, row);
    startRemoving(async () => {
      try {
        const result = await removeRelationshipAction(
          exerciseId,
          target.fromId,
          target.toId,
          target.kind,
        );
        if (result.error || !result.relationships) {
          setError(result.error ?? "Could not remove the relationship.");
          return;
        }
        setRows(result.relationships);
      } catch {
        setError("Could not remove the relationship. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader meta={`${rows.length} link${rows.length === 1 ? "" : "s"}`}>
        Relationships
      </SectionHeader>
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        Typed Variation and Alternative links, shown in both directions. Links are directional
        &mdash; adding one never creates its reverse. These are the candidates Substitution
        resolves over first.
      </p>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <RelationshipGroup
        title="This movement's variations & alternatives"
        empty="No outgoing links yet."
        rows={grouped.outgoing}
        exerciseId={exerciseId}
        onRemove={remove}
        removable
        busy={isRemoving}
      />
      <RelationshipGroup
        title="Movements that point at this one"
        empty="No incoming links."
        rows={grouped.incoming}
        exerciseId={exerciseId}
        onRemove={remove}
        removable
        busy={isRemoving}
      />

      <AddRelationship
        exerciseId={exerciseId}
        onAdded={setRows}
        onError={setError}
      />
    </div>
  );
}

function RelationshipGroup({
  title,
  empty,
  rows,
  exerciseId,
  onRemove,
  removable,
  busy,
}: {
  title: string;
  empty: string;
  rows: ExerciseRelationship[];
  exerciseId: number;
  onRemove: (row: ExerciseRelationship) => void;
  removable: boolean;
  busy: boolean;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
        {title}
      </h4>
      {rows.length === 0 ? (
        <p className="font-mono text-[13px] text-text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={`${row.direction}-${row.kind}-${row.id}`}
              className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface px-3.5 py-2.5 font-mono text-[13px]"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-text-primary">{row.name}</span>
                <span className="text-[11px] text-text-muted">
                  {relationshipKindLabel(row.kind)} &middot;{" "}
                  {relationshipDirectionLabel(row.direction, row.kind)}
                </span>
              </span>
              {removable ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRemove(row)}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddRelationship({
  exerciseId,
  onAdded,
  onError,
}: {
  exerciseId: number;
  onAdded: (rows: ExerciseRelationship[]) => void;
  onError: (message: string | null) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<LinkCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [kind, setKind] = useState<RelationshipKind>("variation");
  const [searched, setSearched] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSearching, startSearching] = useTransition();
  const [isAdding, startAdding] = useTransition();

  function search(): void {
    setLocalError(null);
    onError(null);
    startSearching(async () => {
      try {
        const result = await searchLinkCandidatesAction(exerciseId, query);
        if (result.error) {
          setLocalError(result.error);
          return;
        }
        setCandidates(result.candidates);
        setSelectedId(result.candidates[0]?.id ?? null);
        setSearched(true);
      } catch {
        setLocalError("Could not search exercises. Try again.");
      }
    });
  }

  function add(): void {
    setLocalError(null);
    onError(null);
    if (selectedId === null) return;
    startAdding(async () => {
      try {
        const result = await addRelationshipAction(exerciseId, selectedId, kind);
        if (result.error || !result.relationships) {
          setLocalError(result.error ?? "Could not add the relationship.");
          return;
        }
        onAdded(result.relationships);
        // Reset the picker so a follow-up add starts clean.
        setQuery("");
        setCandidates([]);
        setSelectedId(null);
        setSearched(false);
      } catch {
        setLocalError("Could not add the relationship. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <h4 className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
        Add a link
      </h4>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Find a movement" htmlFor="relationship-search" className="flex-1">
          <Input
            id="relationship-search"
            value={query}
            placeholder="Search the catalog…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                search();
              }
            }}
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          disabled={query.trim() === "" || isSearching}
          onClick={search}
          className="self-start sm:self-auto"
        >
          {isSearching ? "Searching…" : "Search"}
        </Button>
      </div>

      {searched && candidates.length === 0 && !localError ? (
        <p className="font-mono text-[13px] text-text-muted">
          No matching movements. Try another name.
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Movement" htmlFor="relationship-target" className="flex-1">
            <Select
              id="relationship-target"
              value={selectedId ?? ""}
              onChange={(event) => setSelectedId(Number(event.target.value))}
            >
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kind" htmlFor="relationship-kind">
            <Select
              id="relationship-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as RelationshipKind)}
              className="sm:w-44"
            >
              {relationshipKindOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="button"
            variant="primary"
            disabled={selectedId === null || isAdding}
            onClick={add}
            className="self-start sm:self-auto"
          >
            {isAdding ? "Adding…" : "Add link"}
          </Button>
        </div>
      ) : null}

      {localError ? <Alert tone="error">{localError}</Alert> : null}
    </div>
  );
}
