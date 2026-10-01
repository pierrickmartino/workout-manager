import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ROW_SCOPED_EVENT_TYPES,
  toBuilderEvent,
  type PrescriptionEvent,
} from "./prescription-draft.ts";

// The Session editor's rows speak a session-free vocabulary (ADR-0105): a row knows its own
// position and nothing about which Session it sits in, and the one seam that re-attaches the
// `sessionId` is `toBuilderEvent`. These tests hold that seam, because it is the single point
// where a mistake would send a row's edit to the wrong Session — the failure mode the 13
// drilled callbacks made impossible by construction and this one funnel has to earn back.

const SESSION_ID = 42;

// One of each row-scoped event. Exhaustiveness is asserted below rather than asserted in a
// comment, so a 14th entry in the registry cannot arrive without a sample to exercise it.
const EVENTS: PrescriptionEvent[] = [
  { type: "EDIT_PRESCRIPTION", position: 0, field: "sets", value: 4 },
  { type: "EDIT_LOAD", position: 1, loadKind: "absolute", loadValue: "60" },
  { type: "SET_SCHEME", position: 2, scheme: "double-progression" },
  { type: "SET_SET_TYPE", position: 3, setType: "drop" },
  {
    type: "SET_TARGET_EFFORT",
    position: 4,
    targetEffort: { scale: "rpe", value: 8 },
  },
  { type: "SET_NOTE", position: 5, note: "brace before the pull" },
  {
    type: "SET_QUANTITY",
    position: 6,
    quantityKind: "distance",
    quantityUnit: "km",
  },
  { type: "EDIT_ROUND_REST", position: 7, roundRestSeconds: 90 },
  { type: "REORDER_PRESCRIPTION", from: 8, to: 3 },
  { type: "GROUP_WITH_NEXT", position: 9 },
  { type: "UNGROUP", position: 10 },
  { type: "REMOVE_PRESCRIPTION", position: 11 },
  { type: "RESOLVE_DROP", intent: { kind: "join-group", from: 12, group: "g1" } },
];

test("the sample holds one of every event in the row-scoped registry", () => {
  // Arrange / Act / Assert — the registry is the vocabulary; this is what makes the assertions
  // below cover it rather than cover whichever 13 were convenient when they were written.
  assert.deepEqual(
    EVENTS.map((event) => event.type).sort(),
    [...ROW_SCOPED_EVENT_TYPES].sort(),
    "a row-scoped event with no sample here is re-addressed by code nothing exercises",
  );
});

test("every row event reaches the reducer addressed to the open session", () => {
  for (const event of EVENTS) {
    // Arrange / Act
    const dispatched = toBuilderEvent(SESSION_ID, event);

    // Assert — the session id is attached and nothing else moves: the row's own payload
    // rides through untouched, so the funnel adds addressing and no interpretation.
    assert.deepEqual(
      dispatched,
      { ...event, sessionId: SESSION_ID },
      `${event.type} must ride through with only the session id added`,
    );
  }
});

test("the row event is left unmutated, so a caller can raise the same one twice", () => {
  // Arrange
  const event: PrescriptionEvent = {
    type: "EDIT_PRESCRIPTION",
    position: 0,
    field: "reps",
    value: "8-12",
  };

  // Act
  toBuilderEvent(SESSION_ID, event);

  // Assert — immutability (CLAUDE.md → Conventions): the seam copies, it does not stamp the
  // session id onto the caller's object.
  assert.deepEqual(event, {
    type: "EDIT_PRESCRIPTION",
    position: 0,
    field: "reps",
    value: "8-12",
  });
});

