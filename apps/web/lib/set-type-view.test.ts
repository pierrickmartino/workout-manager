import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SET_TYPE,
  SET_TYPE_OPTIONS,
  loggedSetTypeBadge,
  planSetType,
  prescriptionSetTypeBadge,
  resolveSetType,
  setTypeBadge,
  type SetType,
} from "./set-type-view.ts";

// `set-type-view` decides the one thing the plan and record views need for a set's Set Type
// (ADR-0065, #449): which badge to show, if any. Set Type is descriptive-only, so the rule
// under test is purely presentational — an unset (or working) Set Type shows no badge, and a
// non-default member shows its label. These tests pin the resolution and the badge rule.

test("an unset Set Type resolves to working", () => {
  // Arrange / Act / Assert — null and undefined both read as the default working set
  assert.equal(resolveSetType(null), DEFAULT_SET_TYPE);
  assert.equal(resolveSetType(undefined), DEFAULT_SET_TYPE);
  assert.equal(DEFAULT_SET_TYPE, "working");
});

test("a known stored member resolves to itself", () => {
  const members: SetType[] = ["warm_up", "working", "drop", "failure", "amrap"];
  for (const member of members) {
    assert.equal(resolveSetType(member), member);
  }
});

test("an unknown stored value resolves to working, never throwing", () => {
  // A legacy/foreign value reads as the default rather than a fabricated label.
  assert.equal(resolveSetType("superset"), DEFAULT_SET_TYPE);
});

test("an unset Set Type renders no badge", () => {
  // The quiet case: a plain set carries no visual noise.
  assert.equal(setTypeBadge(null), null);
  assert.equal(setTypeBadge(undefined), null);
});

test("an explicit working Set Type also renders no badge", () => {
  // Working is the default; badging it would be noise, so it is suppressed too.
  assert.equal(setTypeBadge("working"), null);
});

test("a warm-up renders a labeled badge", () => {
  const badge = setTypeBadge("warm_up");
  assert.deepEqual(badge, { value: "warm_up", label: "Warm-up" });
});

test("every non-default member renders its own label", () => {
  assert.equal(setTypeBadge("drop")?.label, "Drop set");
  assert.equal(setTypeBadge("failure")?.label, "To failure");
  assert.equal(setTypeBadge("amrap")?.label, "AMRAP");
});

test("an unknown Set Type value renders no badge", () => {
  // Resolves to working → no badge, so a bad value never surfaces a fabricated label.
  assert.equal(setTypeBadge("superset"), null);
});

test("prescriptionSetTypeBadge reads the plan-side field", () => {
  assert.deepEqual(prescriptionSetTypeBadge({ set_type: "amrap" }), {
    value: "amrap",
    label: "AMRAP",
  });
  assert.equal(prescriptionSetTypeBadge({ set_type: null }), null);
});

test("loggedSetTypeBadge reads the record-side field", () => {
  assert.deepEqual(loggedSetTypeBadge({ set_type: "failure" }), {
    value: "failure",
    label: "To failure",
  });
  assert.equal(loggedSetTypeBadge({ set_type: undefined }), null);
});

test("SET_TYPE_OPTIONS lists every member in catalog order with its label", () => {
  // The selector reads the catalog from here, so a plan editor never hardcodes the labels.
  assert.deepEqual(SET_TYPE_OPTIONS, [
    { value: "warm_up", label: "Warm-up" },
    { value: "working", label: "Working" },
    { value: "drop", label: "Drop set" },
    { value: "failure", label: "To failure" },
    { value: "amrap", label: "AMRAP" },
  ]);
});

test("planSetType stores a non-working member as itself", () => {
  // A deliberate warm-up/drop/failure/AMRAP is persisted verbatim.
  assert.equal(planSetType("warm_up"), "warm_up");
  assert.equal(planSetType("amrap"), "amrap");
});

test("planSetType stores an unset or working pick as null", () => {
  // "Working" is the quiet default, so both unset and an explicit working pick author no value.
  assert.equal(planSetType(""), null);
  assert.equal(planSetType(null), null);
  assert.equal(planSetType(undefined), null);
  assert.equal(planSetType("working"), null);
});

test("planSetType stores an unknown value as null, never a fabricated one", () => {
  assert.equal(planSetType("superset"), null);
});
