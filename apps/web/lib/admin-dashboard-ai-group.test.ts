import { test } from "node:test";
import assert from "node:assert/strict";

import { adminDashboardView, rejectedRead } from "./admin-dashboard-view.ts";
import { parseAuditLogState } from "./admin-generation-calls-query.ts";

const BREAKDOWN = { stub: 4, listable: 6, enriched: 10, total: 20 };
const CATALOG_READS = {
  completeness: { success: true, data: BREAKDOWN, error: null },
  retired: { success: true, data: [], error: null, meta: { total: 0, limit: 1, offset: 0 } },
};

const KINDS = {
  session: 6,
  protocol: 2,
  regeneration: 0,
  substitute: 0,
  "muscle-emphasis": 0,
  "exercise-enrichment": 0,
};

const SUMMARY = {
  total_calls: 8,
  by_outcome: { success: 6, error: 2 },
  by_generator_kind: KINDS,
  input_tokens: 1_234_567,
  output_tokens: 98_000,
  unreported_usage_calls: 3,
  median_latency_ms: 2450,
  window_days: 3,
};

function viewWith(generationCalls: Parameters<typeof adminDashboardView>[0]["generationCalls"]) {
  return adminDashboardView({ ...CATALOG_READS, generationCalls });
}

function aiGroup(view: ReturnType<typeof adminDashboardView>) {
  const group = view.groups.find((g) => g.key === "ai");
  assert.ok(group, "the dashboard always carries an AI group");
  return group;
}

const READY = { success: true, data: SUMMARY, error: null };

test("a ready AI group shows calls, error rate, tokens and median latency in order", () => {
  // Arrange / Act — 8 calls in the window, 2 of them failed
  const group = aiGroup(viewWith(READY));

  // Assert
  assert.equal(group.state, "ready");
  assert.deepEqual(
    group.state === "ready" ? group.tiles.map((t) => [t.label, t.value]) : [],
    [
      ["Calls", "8"],
      ["Error rate", "25%"],
      ["Tokens", "1.3M"],
      ["Median latency", "2.5 s"],
    ],
  );
});

test("the Tokens tile says how many calls did not report usage, so the sum reads as a floor", () => {
  // Arrange / Act
  const group = aiGroup(viewWith(READY));

  // Assert — the footnote names the gap; Calls names the window it counts over
  assert.equal(group.state, "ready");
  if (group.state !== "ready") return;
  assert.equal(
    group.tiles.find((t) => t.key === "tokens")?.footnote,
    "1.2M in · 98K out · 3 unreported",
  );
  assert.equal(group.tiles.find((t) => t.key === "calls")?.footnote, "Last 3 days");
});

test("the Tokens footnote names no gap when every call reported usage", () => {
  // Arrange / Act
  const group = aiGroup(
    viewWith({ ...READY, data: { ...SUMMARY, unreported_usage_calls: 0 } }),
  );

  // Assert
  assert.equal(group.state, "ready");
  if (group.state !== "ready") return;
  assert.equal(group.tiles.find((t) => t.key === "tokens")?.footnote, "1.2M in · 98K out");
});

test("the error rate is derived from the outcome counts, to one decimal at most", () => {
  // Arrange
  const rate = (error: number, total: number) => {
    const group = aiGroup(
      viewWith({
        ...READY,
        data: { ...SUMMARY, total_calls: total, by_outcome: { success: total - error, error } },
      }),
    );
    return group.state === "ready" ? group.tiles.find((t) => t.key === "error-rate")?.value : "";
  };

  // Act / Assert — one in three, none, and one in a thousand (never rounded away to 0%)
  assert.equal(rate(1, 3), "33.3%");
  assert.equal(rate(0, 5), "0%");
  assert.equal(rate(1, 1000), "0.1%");
});

test("each AI tile links into the audit log, filtered to errors only on Error rate", () => {
  // Arrange / Act
  const group = aiGroup(viewWith(READY));

  // Assert
  assert.deepEqual(
    group.state === "ready" ? group.tiles.map((t) => [t.key, t.href]) : [],
    [
      ["calls", "/admin/ai-audit-log"],
      ["error-rate", "/admin/ai-audit-log?outcome=error"],
      ["tokens", "/admin/ai-audit-log"],
      ["latency", "/admin/ai-audit-log"],
    ],
  );
});

function parsedAuditLog(href: string) {
  return parseAuditLogState(Object.fromEntries(new URLSearchParams(href.split("?")[1] ?? "")));
}

test("the Error rate link round-trips through the audit log's filter parser", () => {
  // Arrange
  const group = aiGroup(viewWith(READY));
  const href = group.state === "ready" ? group.tiles[1].href : "";

  // Act / Assert — the log reads back exactly the failed-calls filter, on page 1
  assert.deepEqual(parsedAuditLog(href), {
    filters: { generatorKind: null, outcome: "error", userId: null },
    page: 1,
  });
});

test("an empty window shows — on every AI tile with honest empty copy, never 0%", () => {
  // Arrange / Act
  const group = aiGroup(
    viewWith({
      ...READY,
      data: {
        ...SUMMARY,
        total_calls: 0,
        by_outcome: { success: 0, error: 0 },
        input_tokens: 0,
        output_tokens: 0,
        unreported_usage_calls: 0,
        median_latency_ms: null,
      },
    }),
  );

  // Assert — still four linked tiles, each a dash, plus a message naming the window
  assert.equal(group.state, "empty");
  if (group.state !== "empty") return;
  assert.deepEqual(
    group.tiles.map((t) => [t.label, t.value]),
    [
      ["Calls", "—"],
      ["Error rate", "—"],
      ["Tokens", "—"],
      ["Median latency", "—"],
    ],
  );
  assert.ok(group.tiles.every((t) => t.href.startsWith("/admin/ai-audit-log")));
  assert.equal(group.message, "No Generation Calls in the last 3 days, so there is nothing to summarize.");
});

test("a refused summary fails only the AI group, with the backend's reason", () => {
  // Arrange / Act
  const view = viewWith({ success: false, data: null, error: "Admin access required" });

  // Assert — the AI group is an inline error; the catalog group is untouched
  const group = aiGroup(view);
  assert.equal(group.state, "failed");
  assert.equal(
    group.state === "failed" ? group.message : "",
    "Could not load the AI summary: Admin access required",
  );
  assert.equal(view.groups.find((g) => g.key === "catalog")?.state, "ready");
  assert.equal(view.generatorKinds, null);
});

test("a rejected summary read (transport failure) fails the AI group with a real reason", () => {
  // Arrange / Act
  const group = aiGroup(viewWith(rejectedRead()));

  // Assert
  assert.equal(
    group.state === "failed" ? group.message : "",
    "Could not load the AI summary: the API could not be reached",
  );
});

test("a failed catalog read leaves the AI group ready", () => {
  // Arrange / Act
  const view = adminDashboardView({ ...CATALOG_READS, retired: rejectedRead(), generationCalls: READY });

  // Assert
  assert.equal(view.groups.find((g) => g.key === "catalog")?.state, "failed");
  assert.equal(aiGroup(view).state, "ready");
});

test("the Generator Kind breakdown lists every kind in the backend's order, each a filtered link", () => {
  // Arrange / Act
  const { generatorKinds } = viewWith(READY);

  // Assert
  assert.deepEqual(
    generatorKinds?.map((k) => [k.label, k.count, k.href]),
    [
      ["Session", "6", "/admin/ai-audit-log?kind=session"],
      ["Protocol", "2", "/admin/ai-audit-log?kind=protocol"],
      ["Regeneration", "0", "/admin/ai-audit-log?kind=regeneration"],
      ["Substitute", "0", "/admin/ai-audit-log?kind=substitute"],
      ["Muscle emphasis", "0", "/admin/ai-audit-log?kind=muscle-emphasis"],
      ["Exercise enrichment", "0", "/admin/ai-audit-log?kind=exercise-enrichment"],
    ],
  );
});

test("each Generator Kind link round-trips through the audit log's filter parser", () => {
  // Arrange
  const { generatorKinds } = viewWith(READY);

  // Act / Assert — every kind reads back as exactly its own filter
  for (const row of generatorKinds ?? []) {
    assert.deepEqual(parsedAuditLog(row.href).filters, {
      generatorKind: row.kind,
      outcome: null,
      userId: null,
    });
  }
  assert.equal(generatorKinds?.length, 6);
});
