import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { toFitnessLevelRows } from "./fitness-level-standing.ts";
import type { FitnessLevelStanding } from "./profile-progress-types.ts";
import { loadTsx } from "./tsx-harness.ts";

// `fitness-level-standing` is the view-model behind the Profile view's Fitness Level section
// (ADR-0112, #606): one row per declared Training Type carrying both readings — the Declared
// level the user states about themselves and the Effective level the app plans with — and the
// one sentence that says how they relate. The component stays a thin renderer, so the copy and
// the ordering are asserted here.

function standing(
  overrides: Partial<FitnessLevelStanding> = {},
): FitnessLevelStanding {
  return { training_type: "strength", declared: 5, effective: 5, ...overrides };
}

test("reads both figures out of one standing", () => {
  const [row] = toFitnessLevelRows([
    standing({ declared: 5, effective: 8 }),
  ]);

  assert.equal(row.trainingType, "strength");
  assert.equal(row.declaredText, "5/10");
  assert.equal(row.effectiveText, "8/10");
  assert.equal(row.raised, true);
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
  // is not the same message as a blank. So the note is non-empty, both figures are present,
  // and it says the record was read.
  assert.equal(row.raised, false);
  assert.equal(row.declaredText, "5/10");
  assert.equal(row.effectiveText, "5/10");
  assert.match(row.note, /recent record/);
  assert.notEqual(row.note, "");
});

test("captions a standing below the declared level truthfully rather than as no change", () => {
  // The Declared level is a floor the projection never breaches, so this cannot arrive from
  // the read model — but the view-model is handed response data like any other untrusted
  // input. Folding it in with the equal case would print "nothing in your recent record moves
  // it" beside two different numbers, so the row says only what is observably true and claims
  // no cause. Both figures still render: the screen never hides a number it was given.
  const [row] = toFitnessLevelRows([standing({ declared: 5, effective: 4 })]);

  assert.equal(row.raised, false);
  assert.equal(row.declaredText, "5/10");
  assert.equal(row.effectiveText, "4/10");
  assert.equal(row.note, "1 level below what you declared.");
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
// The view-model above owns the copy, but two of the ticket's claims are about the rendered
// screen: that the equal case states itself rather than going blank, and that each Training
// Type is separately named in the page outline (ADR-0094). A view-model cannot assert either,
// so the section is mounted for real.

const SECTION = "components/pulse/fitness-level-standings.tsx";

function render(element: React.ReactElement): Document {
  return new JSDOM(renderToStaticMarkup(element)).window.document;
}

test("renders both readings for every declared Training Type", () => {
  // Arrange — strength has earned a notch; yoga reads at exactly its declared level
  const { FitnessLevelStandings } = loadTsx(SECTION);
  const rows = toFitnessLevelRows([
    standing({ training_type: "strength", declared: 5, effective: 8 }),
    standing({ training_type: "yoga", declared: 2, effective: 2 }),
  ]);

  // Act
  const document = render(React.createElement(FitnessLevelStandings, { rows }));

  // Assert — four figures, two per row, each under its own reading's label
  const pairs = [...document.querySelectorAll("dl")].map((list) => ({
    labels: [...list.querySelectorAll("dt")].map((term) => term.textContent),
    values: [...list.querySelectorAll("dd")].map((value) => value.textContent),
  }));
  assert.deepEqual(pairs, [
    { labels: ["Declared", "Effective"], values: ["5/10", "8/10"] },
    { labels: ["Declared", "Effective"], values: ["2/10", "2/10"] },
  ]);
});

test("the equal case renders its figures and its sentence, not an absence", () => {
  // Arrange — the common case: the app read the record and found no change
  const { FitnessLevelStandings } = loadTsx(SECTION);
  const rows = toFitnessLevelRows([standing({ declared: 5, effective: 5 })]);

  // Act
  const document = render(React.createElement(FitnessLevelStandings, { rows }));

  // Assert — nothing is omitted or left blank; the row says what was read
  assert.deepEqual(
    [...document.querySelectorAll("dd")].map((value) => value.textContent),
    ["5/10", "5/10"],
  );
  assert.match(
    document.body.textContent!,
    /Matches what you declared — nothing in your recent record moves it\./,
  );
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
