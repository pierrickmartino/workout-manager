// Pure logic for the admin relationship manager (issue #505, spec §5): the typed
// Variation/Alternative links an admin lists in both directions, adds, and removes — the
// lookup-first candidates Substitution resolves over. Frontend logic lives here per the repo
// rule so it is unit-testable with `node --test` and the component stays thin. No server or
// React imports.
//
// A link is a single directed row: `to` is a `kind` of `from`. From one Exercise's editor an
// *outgoing* link (this → other) is one this Exercise owns; an *incoming* link (other → this)
// is owned by the other Exercise but shown here so a curator sees the full local graph. No
// reciprocal link is ever created — the backend adds exactly the one row.

// The closed relationship vocabulary (CONTEXT: Variation / Alternative). The backend
// re-validates against the same set (422 on anything else), so this is only the client option
// list.
export const RELATIONSHIP_KINDS = ["variation", "alternative"] as const;

export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

export type RelationshipDirection = "outgoing" | "incoming";

// One relationship exactly as `GET /api/exercises/{id}/relationships` returns it (the wire
// shape): the *other* Exercise, the kind, and which way the link points relative to the viewed
// Exercise.
export interface ExerciseRelationship {
  id: number;
  name: string;
  kind: RelationshipKind;
  direction: RelationshipDirection;
}

export interface RelationshipKindOption {
  value: RelationshipKind;
  label: string;
}

export function relationshipKindLabel(kind: string): string {
  if (kind === "variation") return "Variation";
  if (kind === "alternative") return "Alternative";
  return kind;
}

// The kind <select> options for the add form, labelled as the UI surfaces them.
export function relationshipKindOptions(): RelationshipKindOption[] {
  return RELATIONSHIP_KINDS.map((value) => ({
    value,
    label: relationshipKindLabel(value),
  }));
}

export function isRelationshipKind(value: string): value is RelationshipKind {
  return (RELATIONSHIP_KINDS as readonly string[]).includes(value);
}

// A one-line description of a link's direction *relative to the viewed Exercise*, so the row
// reads unambiguously (the graph is directional and no reciprocal is implied).
export function relationshipDirectionLabel(
  direction: RelationshipDirection,
  kind: RelationshipKind,
): string {
  const noun = relationshipKindLabel(kind).toLowerCase();
  const article = /^[aeiou]/i.test(noun) ? "an" : "a";
  return direction === "outgoing"
    ? `Has this ${noun}`
    : `Is ${article} ${noun} of this movement`;
}

// The `(from, to, kind)` a remove call must target for a given row. An outgoing row is the
// link `(this → other)`; an incoming row is `(other → this)`. Either is removable from this
// editor by naming the correct `from` end (the DELETE endpoint keys on the `from` Exercise).
export interface RemovalTarget {
  fromId: number;
  toId: number;
  kind: RelationshipKind;
}

export function relationshipRemovalTarget(
  exerciseId: number,
  row: ExerciseRelationship,
): RemovalTarget {
  return row.direction === "outgoing"
    ? { fromId: exerciseId, toId: row.id, kind: row.kind }
    : { fromId: row.id, toId: exerciseId, kind: row.kind };
}

// A candidate the add-target search offers: a catalog Exercise the admin may link to. Drops
// the Exercise being edited (a self-link is rejected 422 by the backend anyway) so the picker
// never offers it. A candidate already linked under the chosen kind is left in — the backend
// rejects the duplicate with a 409 the form surfaces — but the same target under a *different*
// kind is a valid new link, so target-level filtering stays coarse (self only).
export interface LinkCandidate {
  id: number;
  name: string;
}

export function filterAddCandidates(
  exerciseId: number,
  results: readonly LinkCandidate[],
): LinkCandidate[] {
  return results.filter((result) => result.id !== exerciseId);
}

// Split the flat list into the two directions for display, each preserving input order. The
// editor shows outgoing links (this movement's own Variations/Alternatives) above the incoming
// ones (movements that point at this one).
export interface GroupedRelationships {
  outgoing: ExerciseRelationship[];
  incoming: ExerciseRelationship[];
}

export function groupRelationships(
  rows: readonly ExerciseRelationship[],
): GroupedRelationships {
  return {
    outgoing: rows.filter((row) => row.direction === "outgoing"),
    incoming: rows.filter((row) => row.direction === "incoming"),
  };
}
