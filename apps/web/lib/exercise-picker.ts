// The Exercise picker's create-on-miss view-model (ADR-0033, issue #288): given the
// typed query and the catalog matches it returned, decide whether to offer creating the
// typed movement, and with what display name. Pure and browser-safe (no server-only
// imports), so the offer rule is unit-tested here rather than re-derived inside the
// picker component. The actual mint is a `POST /api/exercises` (search-and-create) the
// caller runs on confirmation; this module only decides *whether* to offer it.
//
// Suppressing the offer for a name that already resolves is best-effort UX, not the
// dedup guarantee: the endpoint dedups by normalized name on create (ADR-0002), so a
// match paged out of these search results can still be offered and still won't mint a
// duplicate. Boundary rejections (blank / over-long) are left to the endpoint contract
// and surfaced from its envelope error, not re-implemented here.

import type { ExerciseSearchResult } from "./exercises-types.ts";

// Collapse a name to the backend's dedup key: trim, collapse every run of internal
// whitespace to a single space, and lowercase. Mirrors `normalize_name` in
// `app/domain/exercise.py`, so two names the catalog would dedup together compare equal
// here too — that parity is what lets the picker recognize an already-listed movement.
export function normalizeMovementName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

// What the picker should do with the current query, given the returned matches:
//   - `offer`  — a name worth offering to create (carries the trimmed display name);
//   - `hidden` — nothing to create (blank name, or a returned match already resolves).
export type CreateOffer = { kind: "offer"; name: string } | { kind: "hidden" };

// Decide whether to offer creating the typed movement. Hidden for a blank name or when a
// returned match already resolves to it (dedup by normalized name — the user should pick
// that entry, not mint a duplicate); otherwise offered with the trimmed name the create
// call will send. A blank or over-long name that reaches the endpoint anyway is rejected
// there per its contract, so no length rule is duplicated in the browser.
export function createOffer(
  query: string,
  results: readonly ExerciseSearchResult[],
): CreateOffer {
  const normalized = normalizeMovementName(query);
  if (normalized === "") return { kind: "hidden" };

  const alreadyInCatalog = results.some(
    (result) => normalizeMovementName(result.name) === normalized,
  );
  if (alreadyInCatalog) return { kind: "hidden" };

  return { kind: "offer", name: query.trim() };
}
