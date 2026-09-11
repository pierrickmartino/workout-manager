import { test } from "node:test";
import assert from "node:assert/strict";

import { schemePreview, schemePreviewForInput } from "./scheme-preview.ts";
import type { Load } from "./load.ts";

// `scheme-preview` renders a Progression Scheme's stepping rule as one plain-language sentence
// (CONTEXT: Scheme Preview; ADR-0064, #452), the web twin of the backend `scheme_preview`. These
// tests pin the rendered sentence for representative schemes and, above all, the **Load-kind
// honesty** rule: a weight axis speaks of kilograms, a pure-bodyweight movement of reps (never
// "add kg"), and a Load with no clean value to step says so. The full-string assertions are the
// literal mirror of the backend `test_scheme_preview.py`, so the two surfaces can never drift.

const ABSOLUTE: Load = { kind: "absolute", text: "60kg", kg: 60 };
const WEIGHTED_BODYWEIGHT: Load = { kind: "bodyweight", text: "+10kg", added_kg: 10 };
const PURE_BODYWEIGHT: Load = { kind: "bodyweight", text: "Bodyweight" };
const PERCENT: Load = { kind: "percent_1rm", text: "70% 1RM", percent: 70 };
const RANGE: Load = { kind: "range", text: "70-80kg", low_kg: 70, high_kg: 80 };
const QUALITATIVE: Load = { kind: "qualitative", text: "moderate" };

test("Double Progression on an absolute load speaks of kilograms", () => {
  assert.equal(
    schemePreview("double_progression", "8-12", ABSOLUTE),
    "Aim for 8–12 reps; when every set reaches 12 at RPE 7 or lower, add 2.5 kg next " +
      "time — miss the 8-rep floor and it backs off 5 kg.",
  );
});

test("Double Progression on pure bodyweight speaks of reps, never kilograms", () => {
  const sentence = schemePreview("double_progression", "8-12", PURE_BODYWEIGHT);
  assert.ok(sentence.includes("add a rep to the target next time"));
  assert.ok(!sentence.includes("kg"));
});

test("Double Progression at the rep ceiling offers a harder variation", () => {
  const sentence = schemePreview("double_progression", "20", PURE_BODYWEIGHT);
  assert.ok(sentence.includes("harder variation"));
  assert.ok(!sentence.includes("kg"));
});

test("Double Progression holds honestly on a load with no single value", () => {
  for (const load of [PERCENT, RANGE, QUALITATIVE]) {
    const sentence = schemePreview("double_progression", "8-12", load);
    assert.ok(sentence.includes("needs a single load value to step"));
    assert.ok(!sentence.includes("add"));
  }
});

test("Greyskull steps and resets on a weighted movement", () => {
  assert.equal(
    schemePreview("greyskull", "5+", ABSOLUTE),
    "Do 5+ reps with an all-out final set; clear the 5-rep floor and add 2.5 kg next " +
      "session — miss it and the load resets down 10%.",
  );
});

test("Greyskull reads a weighted-bodyweight range floor", () => {
  const sentence = schemePreview("greyskull", "5-8", WEIGHTED_BODYWEIGHT);
  assert.ok(sentence.includes("clear the 5-rep floor"));
  assert.ok(sentence.includes("resets down 10%"));
});

test("Greyskull on pure bodyweight reads as inapplicable, never fabricating kg", () => {
  const sentence = schemePreview("greyskull", "8-12", PURE_BODYWEIGHT);
  assert.ok(sentence.includes("only steps a weighted movement"));
  assert.ok(!sentence.includes("kg"));
});

test("Session-Count steps every third exposure with no rep or effort gate", () => {
  assert.equal(
    schemePreview("session_count", "5", ABSOLUTE),
    "Keep 5 reps; every 3rd time you train this movement it adds 2.5 kg automatically " +
      "— no rep or effort target gates it, and it never steps down.",
  );
});

test("Session-Count on pure bodyweight adds a rep, never kilograms", () => {
  const sentence = schemePreview("session_count", "8-12", PURE_BODYWEIGHT);
  assert.ok(sentence.includes("adds a rep to the 8–12 reps target"));
  assert.ok(!sentence.includes("kg"));
});

test("Static holds every load kind by hand", () => {
  for (const load of [ABSOLUTE, PURE_BODYWEIGHT, PERCENT, RANGE]) {
    const sentence = schemePreview("static", "8-12", load);
    assert.ok(sentence.startsWith("Static holds 8–12 reps"));
    assert.ok(sentence.includes("nothing auto-adjusts; you set the numbers by hand."));
  }
});

test("Static without a load omits the load clause", () => {
  assert.equal(
    schemePreview("static", "8-12", null),
    "Static holds 8–12 reps exactly as written — nothing auto-adjusts; you set the " +
      "numbers by hand.",
  );
});

test("schemePreviewForInput mirrors the typed preview over raw builder fields", () => {
  // Absolute value → weight axis, so the kilogram step shows.
  assert.ok(
    schemePreviewForInput("double_progression", "8-12", "absolute", "60").includes(
      "add 2.5 kg next time",
    ),
  );
  // A blank bodyweight value is pure bodyweight → the rep phrasing, no "add kg".
  const bodyweight = schemePreviewForInput("double_progression", "8-12", "bodyweight", "");
  assert.ok(bodyweight.includes("add a rep to the target next time"));
  assert.ok(!bodyweight.includes("kg"));
  // A positive bodyweight value is weighted → the kilogram step returns.
  assert.ok(
    schemePreviewForInput("greyskull", "5", "bodyweight", "10").includes("add 2.5 kg next session"),
  );
});
