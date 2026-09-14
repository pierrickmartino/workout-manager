// Pure logic for the admin curator controls (issue #503, ADR-0075/0076 spec §5): the
// deliberate Provenance control and the curator-only precautions field. Frontend logic lives
// here per the repo rule so it is unit-testable with `node --test` and the component stays
// thin. No server or React imports.
//
// These two acts are deliberately *separate* from the descriptive edit (issue #502): each has
// its own endpoint and its own Save, so setting Provenance is never a side effect of editing
// other fields (ADR-0075). Provenance change is audited server-side; precautions are not.

import { decodeHtmlEntities } from "./html-entities.ts";
import { provenanceLabel } from "./admin-exercises-view.ts";

// The closed Provenance vocabulary in trust order (CONTEXT: Provenance) — the options the
// deliberate Provenance control offers. The backend re-validates against the same set (422 on
// anything else), so this is only the client-side option list.
export const PROVENANCE_VALUES = [
  "curated",
  "ai_generated",
  "user_entered",
] as const;

export type ProvenanceValue = (typeof PROVENANCE_VALUES)[number];

export interface ProvenanceOption {
  value: ProvenanceValue;
  label: string;
}

// The Provenance <select> options, labelled as the rest of the UI surfaces them (reusing the
// browser's shared `provenanceLabel`).
export function provenanceOptions(): ProvenanceOption[] {
  return PROVENANCE_VALUES.map((value) => ({
    value,
    label: provenanceLabel(value),
  }));
}

export function isProvenanceValue(value: string): value is ProvenanceValue {
  return (PROVENANCE_VALUES as readonly string[]).includes(value);
}

// Seed the precautions textarea from the stored (escaped) list: one decoded entry per line, so
// the admin edits plain text. Decoding for display is what keeps a re-save from double-escaping
// an unchanged entry (the shared `decodeHtmlEntities`); the backend re-escapes whatever is sent
// back.
export function precautionsToField(precautions: readonly string[]): string {
  return precautions.map(decodeHtmlEntities).join("\n");
}

// Split the precautions field into clean entries: one per non-empty line, trimmed, blanks
// dropped — the client twin of the route's list sanitizer. Returns plain text the backend
// HTML-escapes at its write boundary.
export function parsePrecautionsInput(value: string): string[] {
  return value
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// One recorded admin act exactly as `GET /api/exercises/{id}/audit` returns it (the wire
// shape). `detail` carries the act's payload — for a provenance change, `{ from, to }`.
export interface AdminAuditEntry {
  id: number;
  actor: string;
  action: string;
  detail: Record<string, string>;
  created_at: string;
}

// A human one-line summary of an audited act for the trail (ADR-0075). A provenance change
// reads as its labelled old → new tiers; an unknown future action falls back to its raw name so
// the trail still renders.
export function summarizeAuditEntry(entry: AdminAuditEntry): string {
  if (entry.action === "provenance_change") {
    const from = provenanceLabel(entry.detail.from ?? "");
    const to = provenanceLabel(entry.detail.to ?? "");
    return `Provenance: ${from} → ${to}`;
  }
  return entry.action;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

// Whether the precautions field changed from its seeded value — drives the Save button so a
// no-op save is never sent. Compares parsed entries, so pure-whitespace edits that don't change
// the list read as no change.
export function hasPrecautionsChanges(
  initialField: string,
  currentField: string,
): boolean {
  return !sameList(
    parsePrecautionsInput(initialField),
    parsePrecautionsInput(currentField),
  );
}
