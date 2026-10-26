import { test } from "node:test";
import assert from "node:assert/strict";

import {
  toGenerationCallDetailView,
  type GenerationCallDetail,
} from "./admin-generation-call-detail-view.ts";

function detail(
  overrides: Partial<GenerationCallDetail> = {},
): GenerationCallDetail {
  return {
    id: 7,
    created_at: "2026-10-15T12:00:00",
    generator_kind: "session",
    clerk_user_id: "user_alice",
    provider: "anthropic",
    model: "claude-opus",
    input_tokens: 1200,
    output_tokens: 340,
    latency_ms: 2450.4,
    outcome: "success",
    system_prompt: "You are a coach.",
    user_prompt: "Build me a session.",
    output_text: '{"prescriptions":[{"sets":5}]}',
    error_message: null,
    schema_name: "GeneratedSession",
    max_tokens: 8000,
    ...overrides,
  };
}

test("shows the prompts verbatim and the call's list facts", () => {
  // Arrange / Act
  const view = toGenerationCallDetailView(detail());

  // Assert
  assert.equal(view.systemPrompt, "You are a coach.");
  assert.equal(view.userPrompt, "Build me a session.");
  assert.equal(view.call.kindLabel, "Session");
  assert.equal(view.call.userLabel, "user_alice");
  assert.equal(view.schemaLabel, "GeneratedSession");
});

test("JSON output is pretty-printed", () => {
  const view = toGenerationCallDetailView(detail());

  assert.equal(
    view.outputText,
    '{\n  "prescriptions": [\n    {\n      "sets": 5\n    }\n  ]\n}',
  );
});

test("non-JSON output is shown verbatim", () => {
  const cutOff = '{"prescriptions":[{"sets":5';

  const view = toGenerationCallDetailView(detail({ output_text: cutOff }));

  assert.equal(view.outputText, cutOff);
});

test("a successful call has no error section", () => {
  const view = toGenerationCallDetailView(detail());

  assert.equal(view.errorMessage, null);
});

test("a failed call shows its error and no output", () => {
  const view = toGenerationCallDetailView(
    detail({
      outcome: "error",
      output_text: null,
      output_tokens: null,
      error_message: "rate limited",
    }),
  );

  assert.equal(view.errorMessage, "rate limited");
  assert.equal(view.outputText, null);
});

test("a failed call with no recorded message still gets an error section", () => {
  const view = toGenerationCallDetailView(
    detail({ outcome: "error", output_text: null, error_message: null }),
  );

  assert.equal(view.errorMessage, "No error message was recorded.");
});

test("output tokens read against the token budget", () => {
  const view = toGenerationCallDetailView(detail());

  assert.equal(view.tokenBudgetLabel, "340 / 8000");
  assert.equal(view.hitTokenBudget, false);
});

test("output that reached the token budget is flagged as likely cut off", () => {
  const view = toGenerationCallDetailView(
    detail({ output_tokens: 8000, max_tokens: 8000 }),
  );

  assert.equal(view.hitTokenBudget, true);
});

test("an unreported token count reads as unreported, an unrecorded budget as unknown, never flagged", () => {
  const view = toGenerationCallDetailView(
    detail({ output_tokens: null, max_tokens: null, schema_name: null }),
  );

  assert.equal(view.tokenBudgetLabel, "unreported / unknown");
  assert.equal(view.hitTokenBudget, false);
  assert.equal(view.schemaLabel, "unknown");
});
