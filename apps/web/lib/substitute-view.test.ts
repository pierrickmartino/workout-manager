import { test } from "node:test";
import assert from "node:assert/strict";

import { substituteView } from "./substitute-view.ts";

// When the Session page offers Substitute (#787, ADR-0020, ADR-0143): a performed Protocol
// Session is settled history and is never edited, so the control is withheld there. A
// standalone Session keeps it whatever its Logged Count — a plan edit only reaches future
// performances.

test("an un-performed Protocol Session offers Substitute", () => {
  assert.deepEqual(substituteView({ is_protocol_member: true, logged_count: 0 }), {
    show: true,
  });
});

test("a performed Protocol Session withholds Substitute", () => {
  assert.deepEqual(substituteView({ is_protocol_member: true, logged_count: 1 }), {
    show: false,
  });
});

test("a Protocol Session read without a Logged Count withholds Substitute (fails closed)", () => {
  assert.deepEqual(substituteView({ is_protocol_member: true }), { show: false });
});

test("a standalone Session with logged training still offers Substitute", () => {
  assert.deepEqual(substituteView({ is_protocol_member: false, logged_count: 3 }), {
    show: true,
  });
});

test("a standalone Session read without the membership flag offers Substitute", () => {
  assert.deepEqual(substituteView({}), { show: true });
});
