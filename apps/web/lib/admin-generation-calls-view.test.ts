import { test } from "node:test";
import assert from "node:assert/strict";

import {
  toGenerationCallRowView,
  type GenerationCallRow,
} from "./admin-generation-calls-view.ts";

function row(overrides: Partial<GenerationCallRow> = {}): GenerationCallRow {
  return {
    id: 7,
    created_at: "2026-10-15T12:00:00",
    generator_kind: "protocol",
    clerk_user_id: "user_alice",
    provider: "anthropic",
    model: "claude-opus",
    input_tokens: 1200,
    output_tokens: 340,
    latency_ms: 2450.4,
    outcome: "success",
    ...overrides,
  };
}

test("projects a successful call onto its list columns", () => {
  // Arrange / Act
  const view = toGenerationCallRowView(row());

  // Assert
  assert.equal(view.createdAt, "2026-10-15T12:00:00");
  assert.equal(view.kindLabel, "Protocol");
  assert.equal(view.userLabel, "user_alice");
  assert.equal(view.servedBy, "anthropic · claude-opus");
  assert.equal(view.outcomeLabel, "Success");
  assert.equal(view.isError, false);
  assert.equal(view.inputTokensLabel, "1200");
  assert.equal(view.outputTokensLabel, "340");
  assert.equal(view.latencyLabel, "2.5 s");
});

test("an unattributed call reads as system", () => {
  const view = toGenerationCallRowView(
    row({ clerk_user_id: null, generator_kind: "exercise-enrichment" }),
  );

  assert.equal(view.userLabel, "system");
  assert.equal(view.kindLabel, "Exercise enrichment");
});

test("unreported token counts read as unknown, never zero", () => {
  const view = toGenerationCallRowView(
    row({ input_tokens: null, output_tokens: null }),
  );

  assert.equal(view.inputTokensLabel, "unknown");
  assert.equal(view.outputTokensLabel, "unknown");
});

test("a zero token count is shown as zero, not unknown", () => {
  const view = toGenerationCallRowView(row({ output_tokens: 0 }));

  assert.equal(view.outputTokensLabel, "0");
});

test("a failed call is flagged as an error", () => {
  const view = toGenerationCallRowView(row({ outcome: "error" }));

  assert.equal(view.outcomeLabel, "Error");
  assert.equal(view.isError, true);
});

test("a sub-second latency reads in whole milliseconds", () => {
  const view = toGenerationCallRowView(row({ latency_ms: 412.7 }));

  assert.equal(view.latencyLabel, "413 ms");
});

test("a latency that rounds up to a full second reads in seconds, never as 1000 ms", () => {
  const view = toGenerationCallRowView(row({ latency_ms: 999.6 }));

  assert.equal(view.latencyLabel, "1.0 s");
});

test("an unknown generator kind falls back to its raw value", () => {
  const view = toGenerationCallRowView(row({ generator_kind: "future-kind" }));

  assert.equal(view.kindLabel, "future-kind");
});

test("the table's tokens cell reads input over output when usage was reported", () => {
  const view = toGenerationCallRowView(row({ input_tokens: 1200, output_tokens: 340 }));

  assert.equal(view.tokensCell, "1200 / 340");
});

test("the table's tokens cell reads unreported, never zero, when usage was not reported", () => {
  const view = toGenerationCallRowView(
    row({ input_tokens: null, output_tokens: null }),
  );

  assert.equal(view.tokensCell, "unreported");
});

test("each row links to its call's detail page", () => {
  const view = toGenerationCallRowView(row({ id: 42 }));

  assert.equal(view.href, "/admin/ai-audit-log/42");
});
