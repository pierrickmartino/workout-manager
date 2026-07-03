// Shared Home constants and types. This module has NO server-only imports, so it
// is safe to import from both Server and Client Components. The server-only data
// access (Clerk auth + fetch) lives in `lib/home.ts`.

// Mirrors the backend's Readiness enum (app/domain/readiness.py): the qualitative
// three-state signal shown on Home. Deliberately not a recovery percentage
// (ADR-0008) — with no plan calendar there is no honest basis for one.
export type Readiness = "READY" | "CAUTION" | "EXTRA_CAUTION";

// The aggregated Home read. `current_protocol` is always null in F1 slice 1; the
// Current Protocol wiring lands in slice 2.
export interface HomeData {
  readiness: Readiness;
  current_protocol: null;
}

// How each Readiness state renders as a header badge — its display label and the
// Pulse accent it uses. Cyan reads calm, violet a mid warning, magenta an alarm.
export const READINESS_BADGE: Record<
  Readiness,
  { label: string; variant: "cyan" | "violet" | "magenta" }
> = {
  READY: { label: "READY", variant: "cyan" },
  CAUTION: { label: "CAUTION", variant: "violet" },
  EXTRA_CAUTION: { label: "EXTRA CAUTION", variant: "magenta" },
};
