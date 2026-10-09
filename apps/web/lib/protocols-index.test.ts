import { test } from "node:test";
import assert from "node:assert/strict";

import {
  protocolsIndex,
  type ProtocolIndexEntry,
} from "./protocols-index.ts";

// `protocols-index` is the Protocols index view-model (issue #637): it turns the
// `GET /api/protocols` rows into the three groups the page renders — Current pinned, Set
// aside by most-recently-made-Current, Finished by most-recently-performed — with each row's
// title, its "N of M" progress and its last-performed line. Pure, so the page stays thin.

function entry(overrides: Partial<ProtocolIndexEntry>): ProtocolIndexEntry {
  return {
    id: 1,
    name: null,
    label: "gain muscle mass · strength",
    objective: "gain muscle mass",
    training_type: "strength",
    status: "set_aside",
    performed_count: 0,
    session_count: 6,
    last_performed_on: null,
    made_current_at: "2026-05-01T09:00:00+00:00",
    ...overrides,
  };
}

test("an empty index has no groups", () => {
  assert.deepEqual(protocolsIndex([]).groups, []);
  assert.equal(protocolsIndex([]).isEmpty, true);
});

test("groups come out Current, Set aside, Finished, and empty groups are dropped", () => {
  const index = protocolsIndex([
    entry({ id: 1, status: "finished", last_performed_on: "2026-04-01" }),
    entry({ id: 2, status: "current" }),
  ]);

  assert.equal(index.isEmpty, false);
  assert.deepEqual(
    index.groups.map((group) => [group.status, group.heading]),
    [
      ["current", "Current"],
      ["finished", "Finished"],
    ],
  );
});

test("set-aside rows are ordered by when they were last made Current, newest first", () => {
  const index = protocolsIndex([
    entry({ id: 1, made_current_at: "2026-03-01T08:00:00+00:00" }),
    entry({ id: 2, made_current_at: "2026-05-01T08:00:00+00:00" }),
    // Same instant as id 2 written in another offset — earlier on the clock than it reads.
    entry({ id: 3, made_current_at: "2026-05-01T09:00:00+02:00" }),
  ]);

  assert.deepEqual(
    index.groups[0].rows.map((row) => row.id),
    [2, 3, 1],
  );
});

test("finished rows are ordered by last performance, newest first", () => {
  const index = protocolsIndex([
    entry({ id: 1, status: "finished", last_performed_on: "2026-02-10" }),
    entry({ id: 2, status: "finished", last_performed_on: "2026-06-03" }),
    entry({ id: 3, status: "finished", last_performed_on: "2026-04-21" }),
  ]);

  assert.deepEqual(
    index.groups[0].rows.map((row) => row.id),
    [2, 3, 1],
  );
});

test("a named Protocol is titled by its name and keeps the derived label as a subtitle", () => {
  const [row] = protocolsIndex([
    entry({ name: "Summer block", label: "Summer block" }),
  ]).groups[0].rows;

  assert.equal(row.title, "Summer block");
  assert.equal(row.subtitle, "gain muscle mass · strength");
});

test("an unnamed Protocol is titled by its derived label with no subtitle", () => {
  const [row] = protocolsIndex([entry({})]).groups[0].rows;

  assert.equal(row.title, "gain muscle mass · strength");
  assert.equal(row.subtitle, null);
});

test("progress reads as N of M sessions, never a percentage", () => {
  const [row] = protocolsIndex([
    entry({ performed_count: 2, session_count: 6 }),
  ]).groups[0].rows;

  assert.equal(row.progress, "2 of 6 sessions");
});

test("a one-session Protocol's progress is singular", () => {
  const [row] = protocolsIndex([
    entry({ performed_count: 0, session_count: 1 }),
  ]).groups[0].rows;

  assert.equal(row.progress, "0 of 1 session");
});

test("the last-performed line names the date, or is absent when never performed", () => {
  const [performed, never] = protocolsIndex([
    entry({ id: 1, last_performed_on: "2026-09-05", made_current_at: "2026-05-02T00:00:00Z" }),
    entry({ id: 2, last_performed_on: null, made_current_at: "2026-05-01T00:00:00Z" }),
  ]).groups[0].rows;

  assert.equal(performed.lastPerformed, "Last performed Sep 5, 2026");
  assert.equal(never.lastPerformed, null);
});

test("each row opens the Protocol's detail page", () => {
  const [row] = protocolsIndex([entry({ id: 42 })]).groups[0].rows;

  assert.equal(row.href, "/protocols/42");
});
