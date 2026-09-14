import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PROVENANCE_VALUES,
  hasPrecautionsChanges,
  isProvenanceValue,
  parsePrecautionsInput,
  precautionsToField,
  provenanceOptions,
  summarizeAuditEntry,
  type AdminAuditEntry,
} from "./admin-exercise-curation.ts";

test("provenance options cover the closed vocabulary with labels", () => {
  const options = provenanceOptions();
  assert.deepEqual(
    options.map((option) => option.value),
    [...PROVENANCE_VALUES],
  );
  assert.deepEqual(
    options.map((option) => option.label),
    ["Curated", "AI-generated", "User-entered"],
  );
});

test("isProvenanceValue accepts the vocabulary and rejects anything else", () => {
  assert.equal(isProvenanceValue("curated"), true);
  assert.equal(isProvenanceValue("ai_generated"), true);
  assert.equal(isProvenanceValue("user_entered"), true);
  assert.equal(isProvenanceValue("gold_standard"), false);
  assert.equal(isProvenanceValue(""), false);
});

test("parsePrecautionsInput splits one per line, trims, and drops blanks", () => {
  const parsed = parsePrecautionsInput("  brace first \n\n keep a neutral spine \n   ");
  assert.deepEqual(parsed, ["brace first", "keep a neutral spine"]);
});

test("parsePrecautionsInput of an empty field clears the list", () => {
  assert.deepEqual(parsePrecautionsInput("   \n  "), []);
});

test("precautionsToField decodes each stored entry onto its own line for editing", () => {
  const field = precautionsToField(["brace &amp; lift", "&lt;b&gt;"]);
  assert.equal(field, "brace & lift\n<b>");
});

test("a decode→edit→parse round-trip is lossless in plain-text space", () => {
  const stored = ["&lt;b&gt;", "warm up"];
  const field = precautionsToField(stored);
  // Re-parsing the untouched field yields the plain text the backend will re-escape to
  // exactly `stored` — no double escaping.
  assert.deepEqual(parsePrecautionsInput(field), ["<b>", "warm up"]);
});

test("hasPrecautionsChanges is false for an untouched field and pure-whitespace edits", () => {
  const initial = "brace first\nkeep a neutral spine";
  assert.equal(hasPrecautionsChanges(initial, initial), false);
  assert.equal(
    hasPrecautionsChanges(initial, " brace first \n keep a neutral spine "),
    false,
  );
});

test("hasPrecautionsChanges is true when the entries change", () => {
  assert.equal(hasPrecautionsChanges("brace first", "brace first\nadd one"), true);
  assert.equal(hasPrecautionsChanges("brace first", ""), true);
});

function auditEntry(overrides: Partial<AdminAuditEntry> = {}): AdminAuditEntry {
  return {
    id: 1,
    actor: "user_admin",
    action: "provenance_change",
    detail: { from: "ai_generated", to: "curated" },
    created_at: "2026-09-14T00:00:00+00:00",
    ...overrides,
  };
}

test("summarizeAuditEntry labels a provenance change as old → new tiers", () => {
  assert.equal(
    summarizeAuditEntry(auditEntry()),
    "Provenance: AI-generated → Curated",
  );
});

test("summarizeAuditEntry falls back to the raw action for an unknown act", () => {
  assert.equal(
    summarizeAuditEntry(auditEntry({ action: "retire", detail: {} })),
    "retire",
  );
});
