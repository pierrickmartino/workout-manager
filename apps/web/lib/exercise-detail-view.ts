// Shared Exercise Detail view helpers. This module has NO server-only imports, so
// it is safe to import from both Server and Client Components. The server-only data
// access (Clerk auth + fetch) lives in `lib/sessions.ts` and `lib/progress.ts`.

// The three lenses of the Exercise Detail screen (ADR-0017): SPECS (the catalog
// facts), HISTORY (every Logged Session of this Exercise), and RECORDS (PR-setting
// sets — filled by a later slice). The active tab is reflected in the URL as ?tab=.
export type ExerciseTab = "specs" | "history" | "records";

// Narrow an untrusted query value to one of the tabs, defaulting to SPECS.
export function toExerciseTab(value: string | undefined): ExerciseTab {
  return value === "history" || value === "records" ? value : "specs";
}
