import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_DRAFT_FIELD_LENGTH,
  hasUniqueKeys,
  isBoundedDraftString,
  isDraftDate,
  isDraftUuid,
} from "./form-draft-validation.ts";

test("accepts a client UUID and a real ISO date", () => {
  assert.equal(isDraftUuid("9e52574d-d9ad-46ef-a55f-38c7d4a94f2f"), true);
  assert.equal(isDraftDate("2026-09-24"), true);
});

test("rejects malformed UUIDs and impossible dates", () => {
  assert.equal(isDraftUuid("author-draft-key"), false);
  assert.equal(isDraftDate("2026-02-31"), false);
});

test("bounds restored strings before they reach form state", () => {
  assert.equal(isBoundedDraftString("x".repeat(MAX_DRAFT_FIELD_LENGTH)), true);
  assert.equal(isBoundedDraftString("x".repeat(MAX_DRAFT_FIELD_LENGTH + 1)), false);
});

test("requires positive unique row keys", () => {
  assert.equal(hasUniqueKeys([{ id: 1 }, { id: 2 }]), true);
  assert.equal(hasUniqueKeys([{ key: 1 }, { key: 1 }]), false);
  assert.equal(hasUniqueKeys([{ id: -1 }]), false);
});
