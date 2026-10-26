// Pure view-model for the admin AI audit log (issue #730, ADR-0135). Frontend logic lives here
// per the repo rule so it is unit-testable with `node --test` and the page stays thin. No server
// or React imports.
//
// One row is one metered Generation Call: a cache miss that reached the provider, success or
// failure. The list shows metadata only; prompts and output stay off the list payload.

import { ADMIN_AUDIT_LOG_PATH } from "./admin-paths.ts";

// One recorded call exactly as `GET /api/admin/generation-calls` returns it (the wire shape).
// `clerk_user_id` is null for a system call; the token counts are null when the provider did
// not report usage.
export interface GenerationCallRow {
  id: number;
  created_at: string;
  generator_kind: string;
  clerk_user_id: string | null;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  outcome: string;
}

// One row projected for display. `createdAt` stays the raw API instant: the page renders it
// through `LocalInstant`, which owns parsing and the reader's clock (ADR-0096).
export interface GenerationCallRowView {
  id: number;
  // The call's detail page (issue #731), where its prompts and output are read.
  href: string;
  createdAt: string;
  kindLabel: string;
  userLabel: string;
  servedBy: string;
  outcomeLabel: string;
  isError: boolean;
  inputTokensLabel: string;
  outputTokensLabel: string;
    // The wide table's single tokens column (issue #771): "in / out", or one "unreported" when the
  // provider reported no usage at all, so a missing count is never read as zero.
  tokensCell: string;
  latencyLabel: string;
}

// The backend's closed `GeneratorKind` and `GenerationOutcome` enums, as their wire values.
export type GeneratorKind =
  | "session"
  | "protocol"
  | "regeneration"
  | "substitute"
  | "muscle-emphasis"
  | "exercise-enrichment";

export type GenerationOutcome = "success" | "error";

// The generator kinds the backend's `GeneratorKind` emits. An unknown kind falls back to its
// raw value, so a future generator still renders. The list filter offers exactly these.
export const KIND_LABELS: Readonly<Record<GeneratorKind, string>> = {
  session: "Session",
  protocol: "Protocol",
  regeneration: "Regeneration",
  substitute: "Substitute",
  "muscle-emphasis": "Muscle emphasis",
  "exercise-enrichment": "Exercise enrichment",
};

export const OUTCOME_LABELS: Readonly<Record<GenerationOutcome, string>> = {
  success: "Success",
  error: "Error",
};

// The Generation Call log's retention window (ADR-0135), mirrored from the backend's
// `GENERATION_CALL_RETENTION` for copy on pages that read no summary carrying `window_days`.
export const GENERATION_CALL_WINDOW_DAYS = 3;

// The window as running copy: "AI calls of the last 3 days".
export const GENERATION_CALL_WINDOW = `the last ${GENERATION_CALL_WINDOW_DAYS} days`;

// What a call made on no user's behalf (catalog enrichment) shows in the user column.
export const SYSTEM_USER_LABEL = "system";

// What a token count the provider did not report shows — on the list, the detail and the wide
// table alike — so it is never read as zero.
export const UNREPORTED_TOKENS_LABEL = "unreported";

const MS_PER_SECOND = 1000;

function generationCallHref(id: number): string {
  return `${ADMIN_AUDIT_LOG_PATH}/${id}`;
}

function labelFrom(labels: Readonly<Record<string, string>>, value: string): string {
  return Object.hasOwn(labels, value) ? labels[value] : value;
}

// A Generator Kind's label, or its raw value for a kind this build does not know yet.
export function generatorKindLabel(kind: string): string {
  return labelFrom(KIND_LABELS, kind);
}

export function tokensLabel(tokens: number | null): string {
  return tokens === null ? UNREPORTED_TOKENS_LABEL : String(tokens);
}

function tokensCell(input: number | null, output: number | null): string {
  if (input === null && output === null) return UNREPORTED_TOKENS_LABEL;
  return `${tokensLabel(input)} / ${tokensLabel(output)}`;
}

// Whole milliseconds under a second; seconds to one decimal from there, where a generation's
// latency usually sits.
export function latencyLabel(latencyMs: number): string {
  // Compared after rounding, so 999.6 ms reads "1.0 s" rather than "1000 ms".
  const wholeMs = Math.round(latencyMs);
  if (wholeMs < MS_PER_SECOND) return `${wholeMs} ms`;
  return `${(latencyMs / MS_PER_SECOND).toFixed(1)} s`;
}

// Project one wire row onto its display view-model. Pure: it never mutates the input.
export function toGenerationCallRowView(
  row: GenerationCallRow,
): GenerationCallRowView {
  return {
    id: row.id,
    href: generationCallHref(row.id),
    createdAt: row.created_at,
    kindLabel: generatorKindLabel(row.generator_kind),
    userLabel: row.clerk_user_id ?? SYSTEM_USER_LABEL,
    servedBy: `${row.provider} · ${row.model}`,
    outcomeLabel: labelFrom(OUTCOME_LABELS, row.outcome),
    isError: row.outcome === "error",
    inputTokensLabel: tokensLabel(row.input_tokens),
    outputTokensLabel: tokensLabel(row.output_tokens),
    tokensCell: tokensCell(row.input_tokens, row.output_tokens),
    latencyLabel: latencyLabel(row.latency_ms),
  };
}
