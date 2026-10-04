import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { MAX_LEVEL, toFitnessLevelRows } from "./fitness-level-standing.ts";
import type { FitnessLevelStanding } from "./profile-progress-types.ts";
import { loadTsx } from "./tsx-harness.ts";

// `fitness-level-standing` is the view-model behind the Profile view's Fitness Level section
// (ADR-0112, #606): one row per declared Training Type carrying both readings — the Declared
// level the user states about themselves and the Effective level the app plans with — and the
// one sentence that says how they relate.
//
// Both readings are *drawn*, as one rail of ten notches per row, rather than printed as the
// "5/10" pair this section first shipped with. That makes the zone mapping — which notch
// belongs to the declaration, which to what the record earned — a correctness question with a
// right answer, so it lives here and is asserted here, and the component stays a renderer of
// one array. The figures themselves never leave the screen: they are the rail's accessible
// name, which is asserted against the real mount below.

function standing(
  overrides: Partial<FitnessLevelStanding> = {},
): FitnessLevelStanding {
  return { training_type: "strength", declared: 5, effective: 5, ...overrides };
}

test("draws the declared level, then the earned levels, then the rest of the scale", () => {
  const [row] = toFitnessLevelRows([standing({ declared: 5, effective: 8 })]);

  assert.equal(row.trainingType, "strength");
  assert.equal(row.raised, true);
  assert.deepEqual(row.zones, [
    "declared", "declared", "declared", "declared", "declared",
    "earned", "earned", "earned",
    "empty", "empty",
  ]);
});

test("draws one notch per level of the scale, whatever the reading", () => {
  for (const [declared, effective] of [[1, 1], [5, 8], [10, 10], [1, 10]]) {
    const [row] = toFitnessLevelRows([standing({ declared, effective })]);

    assert.equal(row.zones.length, MAX_LEVEL, `${declared} → ${effective}`);
  }
});

test("draws no earned notch where the app plans at exactly the declared level", () => {
  const [row] = toFitnessLevelRows([standing({ declared: 5, effective: 5 })]);

  assert.equal(row.raised, false);
  assert.equal(row.zones.filter((zone) => zone === "earned").length, 0);
  assert.equal(row.zones.filter((zone) => zone === "declared").length, 5);
});

test("names both readings in the rail’s accessible name", () => {
  // The numerals leave the *drawing*, not the data: a reader who gets no figure at all still
  // gets both levels, and in the same breath — which is what the drawn gap says.
  const [row] = toFitnessLevelRows([standing({ declared: 5, effective: 8 })]);

  assert.equal(
    row.readout,
    "Declared level 5 of 10, planning at level 8 of 10.",
  );
});

test("states how far above the declared level the app is planning", () => {
  const [row] = toFitnessLevelRows([standing({ declared: 5, effective: 8 })]);

  assert.match(row.note, /^3 levels above what you declared/);
});

test("says level, not levels, for a single earned notch", () => {
  const [row] = toFitnessLevelRows([standing({ declared: 5, effective: 6 })]);

  assert.match(row.note, /^1 level above what you declared/);
});

test("states the equal case plainly instead of leaving it blank", () => {
  const [row] = toFitnessLevelRows([standing({ declared: 5, effective: 5 })]);

  // The whole point of the row (ADR-0112): a user whose Effective level matches their
  // Declared one must be able to tell the app read their record and found no change, which
  // is not the same message as a blank. So the note is non-empty, both figures are in the
  // readout, and it says the record was read.
  assert.equal(row.raised, false);
  assert.equal(row.readout, "Declared level 5 of 10, planning at level 5 of 10.");
  assert.match(row.note, /recent record/);
  assert.notEqual(row.note, "");
});

test("captions a standing below the declared level truthfully rather than as no change", () => {
  // The Declared level is a floor the projection never breaches, so this cannot arrive from
  // the read model — but the view-model is handed response data like any other untrusted
  // input. Folding it in with the equal case would print "nothing in your recent record moves
  // it" beside two different readings, so the row says only what is observably true and claims
  // no cause.
  const [row] = toFitnessLevelRows([standing({ declared: 5, effective: 4 })]);

  assert.equal(row.raised, false);
  assert.equal(row.note, "1 level below what you declared.");
  // The rail has no backwards zone to draw, so it draws the declaration and stops. Neither
  // figure is hidden: both are still in the readout, and the note says which way they differ.
  assert.equal(row.zones.filter((zone) => zone === "earned").length, 0);
  assert.equal(row.zones.filter((zone) => zone === "declared").length, 5);
  assert.equal(row.readout, "Declared level 5 of 10, planning at level 4 of 10.");
});

test("clamps a reading past the top of the scale to the scale", () => {
  // The projection caps at the top of the scale, so this is response data the view-model does
  // not trust rather than a state it produces. A rail longer than its own scale would be a
  // row that cannot be compared with the one above it.
  const [row] = toFitnessLevelRows([standing({ declared: 9, effective: 12 })]);

  // Nine declared notches and one earned one: the earned zone runs to the top of the scale
  // and stops there, rather than the rail growing a notch the other rows do not have.
  assert.equal(row.zones.length, MAX_LEVEL);
  assert.deepEqual(row.zones.slice(-2), ["declared", "earned"]);
  assert.equal(row.zones.filter((zone) => zone === "earned").length, 1);
});

test("orders rows by the curated Training Type order, not the served order", () => {
  const rows = toFitnessLevelRows([
    standing({ training_type: "yoga" }),
    standing({ training_type: "strength" }),
    standing({ training_type: "cardio" }),
  ]);

  assert.deepEqual(
    rows.map((row) => row.trainingType),
    ["strength", "cardio", "yoga"],
  );
});

test("keeps a Training Type outside the curated set, appended after it", () => {
  const rows = toFitnessLevelRows([
    standing({ training_type: "parkour" }),
    standing({ training_type: "strength" }),
  ]);

  // Drift is graceful: a stored type the curated list does not name is still shown — a
  // declared level is never silently dropped from the screen that explains the app's reading.
  assert.deepEqual(
    rows.map((row) => row.trainingType),
    ["strength", "parkour"],
  );
});

test("projects an empty standing list to no rows", () => {
  assert.deepEqual(toFitnessLevelRows([]), []);
});

// --- what the section actually renders ---
//
// The view-model above owns the zones and the copy, but three of the section's claims are
// about the rendered screen: that a drawn rail still reaches a reader who sees no drawing,
// that the equal case states itself rather than going blank, and that each Training Type is
// separately named in the page outline (ADR-0094). A view-model cannot assert any of them, so
// the section is mounted for real.

const SECTION = "components/pulse/fitness-level-standings.tsx";

function render(element: React.ReactElement): Document {
  return new JSDOM(renderToStaticMarkup(element)).window.document;
}

test("renders one rail per declared Training Type, carrying both readings as its name", () => {
  // Arrange — strength has earned notches; yoga reads at exactly its declared level
  const { FitnessLevelStandings } = loadTsx(SECTION);
  const rows = toFitnessLevelRows([
    standing({ training_type: "strength", declared: 5, effective: 8 }),
    standing({ training_type: "yoga", declared: 2, effective: 2 }),
  ]);

  // Act
  const document = render(React.createElement(FitnessLevelStandings, { rows }));

  // Assert — a rail is a graphic with a name, not an unlabelled row of boxes
  const rails = [...document.querySelectorAll('[role="img"]')];
  assert.deepEqual(
    rails.map((rail) => rail.getAttribute("aria-label")),
    [
      "Declared level 5 of 10, planning at level 8 of 10.",
      "Declared level 2 of 10, planning at level 2 of 10.",
    ],
  );
  // Ten notches each, so the two rows are read against the same scale.
  assert.deepEqual(
    rails.map((rail) => rail.querySelectorAll("span").length),
    [MAX_LEVEL, MAX_LEVEL],
  );
});

test("the equal case renders its rail and its sentence, not an absence", () => {
  // Arrange — the common case: the app read the record and found no change
  const { FitnessLevelStandings } = loadTsx(SECTION);
  const rows = toFitnessLevelRows([standing({ declared: 5, effective: 5 })]);

  // Act
  const document = render(React.createElement(FitnessLevelStandings, { rows }));

  // Assert — nothing is omitted or left blank; the row says what was read
  assert.equal(
    document.querySelector('[role="img"]')!.getAttribute("aria-label"),
    "Declared level 5 of 10, planning at level 5 of 10.",
  );
  assert.match(
    document.body.textContent!,
    /Matches what you declared — nothing in your recent record moves it\./,
  );
});

test("the drawing carries a key, so a notch’s colour means something", () => {
  // Arrange — two zones are drawn, and nothing on the row says which is which
  const { FitnessLevelStandings } = loadTsx(SECTION);
  const rows = toFitnessLevelRows([standing({ declared: 5, effective: 8 })]);

  // Act
  const document = render(React.createElement(FitnessLevelStandings, { rows }));

  // Assert
  assert.match(document.body.textContent!, /DECLARED/);
  assert.match(document.body.textContent!, /EARNED/);
  assert.match(document.body.textContent!, new RegExp(`1.{0,3}${MAX_LEVEL}`));
});

test("each Training Type is named in the outline one rank under the divider", () => {
  // Arrange — the section divider is the <h2> (ADR-0094), so the rows take <h3>: a reader
  // skimming headings hears "strength" and "yoga" instead of one undifferentiated section.
  const { FitnessLevelStandings } = loadTsx(SECTION);
  const rows = toFitnessLevelRows([
    standing({ training_type: "strength" }),
    standing({ training_type: "yoga" }),
  ]);

  // Act
  const document = render(React.createElement(FitnessLevelStandings, { rows }));

  // Assert
  assert.equal(document.querySelector("h2")!.textContent, "▸ FITNESS LEVEL");
  assert.deepEqual(
    [...document.querySelectorAll("h3")].map((heading) => heading.textContent),
    ["strength", "yoga"],
  );
  assert.equal(document.querySelectorAll("h1, h4, h5, h6").length, 0);
});
