import type { WorkoutSession } from "./sessions-types";

// The label credited to an Author whose Profile carries no usable display name. Mirrors the
// backend's `GENERIC_AUTHOR_LABEL` (apps/api/app/domain/session_author.py) so both surfaces
// render the same never-blank fallback. Kept neutral — never a fabricated real name.
export const GENERIC_AUTHOR_LABEL = "Anonymous";

// The Session view's Author line (CONTEXT: Author, issue #395). `byline` is what the header
// renders — "by <name>", visually distinct from Session Provenance (how the plan was made).
// `displayName` is the resolved name alone; `isNamed` is false when the credit fell back to the
// generic label, so the UI can style it as a placeholder rather than a real name.
export interface SessionAuthorView {
  byline: string;
  displayName: string;
  isNamed: boolean;
}

// Map a Session onto its Author view. Pure and server-free (types are erased), so the
// name/fallback decision is unit-testable without a browser or the transport seam.
//
// The server sends the Author's *raw* Profile name (null when unset), so this mapper owns the
// one fallback: a null/blank name — or a read path that omits `author` entirely (live
// hydration) — is treated as unnamed and credited with the generic label, so an Author is
// never rendered blank, and `isNamed` stays meaningful for the placeholder styling.
export function sessionAuthorView(session: WorkoutSession): SessionAuthorView {
  const trimmed = session.author?.display_name?.trim() ?? "";
  const isNamed = trimmed.length > 0;
  const displayName = isNamed ? trimmed : GENERIC_AUTHOR_LABEL;
  return { byline: `by ${displayName}`, displayName, isNamed };
}
