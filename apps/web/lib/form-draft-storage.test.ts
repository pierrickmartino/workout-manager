import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FORM_DRAFTS_KEY,
  clearAllFormDrafts,
  clearFormDraft,
  loadFormDraft,
  saveFormDraft,
  type FormDraftStorage,
} from "./form-draft-storage.ts";

function fakeStorage(): FormDraftStorage & { raw: () => string | null } {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    raw: () => values.get(FORM_DRAFTS_KEY) ?? null,
  };
}

test("a saved draft survives a fresh read with its version and fields", () => {
  const storage = fakeStorage();
  const fields = { performedOn: "2026-09-24", rows: [{ movement: "Running" }] };

  saveFormDraft(storage, "user_1", "adhoc-log", fields, 1_000);
  const restored = loadFormDraft(storage, "user_1", "adhoc-log");

  assert.deepEqual(restored, { savedAt: 1_000, data: fields });
});

test("the same form identity restores only the current account's draft", () => {
  const storage = fakeStorage();
  saveFormDraft(storage, "user_1", "adhoc-log", { movement: "Running" }, 1_000);
  saveFormDraft(storage, "user_2", "adhoc-log", { movement: "Rowing" }, 2_000);

  assert.deepEqual(loadFormDraft(storage, "user_1", "adhoc-log")?.data, {
    movement: "Running",
  });
  assert.deepEqual(loadFormDraft(storage, "user_2", "adhoc-log")?.data, {
    movement: "Rowing",
  });
  assert.equal(loadFormDraft(storage, "user_3", "adhoc-log"), null);
});

test("clearing after an acknowledged save removes only that account and form", () => {
  const storage = fakeStorage();
  saveFormDraft(storage, "user_1", "correction:7", { reps: "8" }, 1_000);
  saveFormDraft(storage, "user_1", "correction:8", { reps: "9" }, 2_000);
  saveFormDraft(storage, "user_2", "correction:7", { reps: "10" }, 3_000);

  clearFormDraft(storage, "user_1", "correction:7");

  assert.equal(loadFormDraft(storage, "user_1", "correction:7"), null);
  assert.deepEqual(loadFormDraft(storage, "user_1", "correction:8")?.data, {
    reps: "9",
  });
  assert.deepEqual(loadFormDraft(storage, "user_2", "correction:7")?.data, {
    reps: "10",
  });
});

test("an unsupported or malformed collection is ignored without throwing", () => {
  const storage = fakeStorage();
  storage.setItem(FORM_DRAFTS_KEY, JSON.stringify({ version: 2, drafts: [] }));
  assert.equal(loadFormDraft(storage, "user_1", "adhoc-log"), null);

  storage.setItem(FORM_DRAFTS_KEY, "{not json");
  assert.equal(loadFormDraft(storage, "user_1", "adhoc-log"), null);
});

test("sign-out cleanup removes every account's local form drafts", () => {
  const storage = fakeStorage();
  saveFormDraft(storage, "user_1", "adhoc-log", { movement: "Running" });
  saveFormDraft(storage, "user_2", "correction:7", { reps: "8" });

  clearAllFormDrafts(storage);

  assert.equal(storage.raw(), null);
  assert.equal(loadFormDraft(storage, "user_1", "adhoc-log"), null);
  assert.equal(loadFormDraft(storage, "user_2", "correction:7"), null);
});

test("form drafts use a distinct namespace from live state and the finish outbox", () => {
  assert.notEqual(FORM_DRAFTS_KEY, "workout-manager.live-session");
  assert.doesNotMatch(FORM_DRAFTS_KEY, /outbox/i);
});

test("saving reports success and exposes blocked or full storage without throwing", () => {
  assert.equal(saveFormDraft(fakeStorage(), "user_1", "adhoc-log", { reps: "8" }), true);
  const blocked: FormDraftStorage = {
    getItem: () => null,
    setItem: () => { throw new Error("QuotaExceededError"); },
    removeItem: () => {},
  };
  assert.equal(saveFormDraft(blocked, "user_1", "adhoc-log", { reps: "8" }), false);
});

test("unrecoverable oversized collections report failure and retain the last usable draft", () => {
  const storage = fakeStorage();
  saveFormDraft(storage, "user_1", "adhoc-log", { reps: "8" });
  assert.equal(saveFormDraft(storage, "user_1", "adhoc-log", { note: "x".repeat(2_000_000) }), false);
  assert.deepEqual(loadFormDraft(storage, "user_1", "adhoc-log")?.data, { reps: "8" });
  for (let index = 0; index < 49; index++) {
    assert.equal(saveFormDraft(storage, "user_1", `correction:${index}`, { reps: "9" }), true);
  }
  assert.equal(saveFormDraft(storage, "user_1", "correction:50", { reps: "10" }), false);
  assert.deepEqual(loadFormDraft(storage, "user_1", "adhoc-log")?.data, { reps: "8" });
});
