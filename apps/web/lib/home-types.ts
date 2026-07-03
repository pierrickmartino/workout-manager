// Shared Home constants and types. This module has NO server-only imports, so it
// is safe to import from both Server and Client Components. The server-only data
// access (Clerk auth + fetch) lives in `lib/home.ts`.

import type { ProtocolProgress } from "./protocols-types";

// Mirrors the backend's Readiness enum (app/domain/readiness.py): the qualitative
// three-state signal shown on Home. Deliberately not a recovery percentage
// (ADR-0008) — with no plan calendar there is no honest basis for one.
export type Readiness = "READY" | "CAUTION" | "EXTRA_CAUTION";

// The aggregated Home read. `current_protocol` is the progressed view of the
// user's Current Protocol — the most-recently-adopted Protocol still holding an
// un-performed Session — or `null` in the empty state (no Protocol, or all
// complete). `readiness` is present in both states.
export interface HomeData {
  readiness: Readiness;
  current_protocol: ProtocolProgress | null;
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
