// Pure view-model for one call on the admin AI audit log (issue #731, ADR-0135). Frontend logic
// lives here per the repo rule so it is unit-testable with `node --test` and the page stays
// thin. No server or React imports.
//
// The detail reads everything about one metered Generation Call: both prompts, the output (or,
// for a failure, why it failed), the requested output schema and the token budget, so a
// cut-off output is obvious.

import {
  tokensLabel,
  toGenerationCallRowView,
  type GenerationCallRow,
  type GenerationCallRowView,
} from "./admin-generation-calls-view.ts";

// One call exactly as `GET /api/admin/generation-calls/{id}` returns it (the wire shape): the
// list row plus the full text. `output_text` is null on a failure, which carries
// `error_message` instead; `schema_name` and `max_tokens` are null only on calls recorded
// before they were captured.
export interface GenerationCallDetail extends GenerationCallRow {
  system_prompt: string;
  user_prompt: string;
  output_text: string | null;
  error_message: string | null;
  schema_name: string | null;
  max_tokens: number | null;
}

export interface GenerationCallDetailView {
  call: GenerationCallRowView;
  schemaLabel: string;
  // Output tokens against the budget, e.g. "340 / 8000".
  tokenBudgetLabel: string;
  // The output used the whole budget, so it was most likely cut off mid-answer.
  hitTokenBudget: boolean;
  systemPrompt: string;
  userPrompt: string;
  // Pretty-printed when it parses as JSON, verbatim otherwise; null when there is none.
  outputText: string | null;
  // Present only on a failed call: the error section renders exactly when this is set.
  errorMessage: string | null;
}

// What a schema name recorded before schemas were captured shows.
export const UNKNOWN_SCHEMA_LABEL = "unknown";

// What a token budget recorded before budgets were captured shows. A budget is a request
// setting, not reported usage, so it is "unknown" rather than "unreported".
export const UNKNOWN_BUDGET_LABEL = "unknown";

// What a failed call recorded without a message (one stored before messages were) shows.
export const NO_ERROR_MESSAGE_LABEL = "No error message was recorded.";

const JSON_INDENT = 2;

function prettyOutput(text: string | null): string | null {
  if (text === null) return null;
  try {
    return JSON.stringify(JSON.parse(text), null, JSON_INDENT);
  } catch {
    // Not JSON (a cut-off or malformed answer): show exactly what the model sent.
    return text;
  }
}

function reachedBudget(output: number | null, budget: number | null): boolean {
  return output !== null && budget !== null && output >= budget;
}

// Project one wire detail onto its display view-model. Pure: it never mutates the input.
export function toGenerationCallDetailView(
  detail: GenerationCallDetail,
): GenerationCallDetailView {
  const call = toGenerationCallRowView(detail);
  return {
    call,
    schemaLabel: detail.schema_name ?? UNKNOWN_SCHEMA_LABEL,
    tokenBudgetLabel: `${tokensLabel(detail.output_tokens)} / ${detail.max_tokens ?? UNKNOWN_BUDGET_LABEL}`,
    hitTokenBudget: reachedBudget(detail.output_tokens, detail.max_tokens),
    systemPrompt: detail.system_prompt,
    userPrompt: detail.user_prompt,
    outputText: prettyOutput(detail.output_text),
    errorMessage: call.isError ? (detail.error_message ?? NO_ERROR_MESSAGE_LABEL) : null,
  };
}
