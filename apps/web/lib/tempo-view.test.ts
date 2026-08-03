import { test } from "node:test";
import assert from "node:assert/strict";

import { toTempoView } from "./tempo-view.ts";

// `toTempoView` is the read-time projection (CONTEXT: Tempo) that turns a stored
// free-form tempo string into the display model the Session detail row renders:
// a coarse three-state label, a plain-language phase expansion, and the raw code
// preserved for hover/screen-reader — with an honest raw-text fallback for
// anything that is not 3- or 4-token notation. Pure and server-free.

test("expands a standard 4-token bare code, eccentric-first, dropping 0s pauses", () => {
  // Arrange — 3s lower, 1s pause at bottom, 1s lift, 0s pause at top
  const view = toTempoView("3110");

  // Assert — the phase expansion reads eccentric-first; the 0s top pause is dropped
  assert.equal(view.kind, "parsed");
  if (view.kind !== "parsed") return;
  assert.equal(view.expansion, "3s lower · 1s pause · 1s lift");
});

test("expands a hyphenated 3-token code with no top pause", () => {
  // Arrange — 2s lower, 0s pause, 2s lift, written with separators
  const view = toTempoView("2-0-2");

  // Assert — separators split the phases; the 0s pause is dropped
  assert.equal(view.kind, "parsed");
  if (view.kind !== "parsed") return;
  assert.equal(view.expansion, "2s lower · 2s lift");
});

test("labels a standard tempo Controlled (the default state)", () => {
  // Arrange — a moderate tempo: short eccentric, brief pause, deliberate lift
  const view = toTempoView("3110");

  // Assert — nothing slow or explosive about it: the Controlled default
  assert.equal(view.kind, "parsed");
  if (view.kind !== "parsed") return;
  assert.equal(view.label, "Controlled");
});

test("labels a long eccentric Slow", () => {
  // Arrange — a deliberately slow 4s lowering
  const view = toTempoView("4-1-1");

  // Assert — the slow eccentric crosses into the Slow state
  assert.equal(view.kind, "parsed");
  if (view.kind !== "parsed") return;
  assert.equal(view.label, "Slow");
});

test("labels an explosive lift Explosive, winning over a slow eccentric", () => {
  // Arrange — 4s lower (slow) but an explosive `X` concentric
  const view = toTempoView("40X0");

  // Assert — Explosive takes precedence over Slow
  assert.equal(view.kind, "parsed");
  if (view.kind !== "parsed") return;
  assert.equal(view.label, "Explosive");
});

test("expands an explosive movement phase as 'explosive', not a seconds count", () => {
  // Arrange — 4s lower, explosive lift, no pauses
  const view = toTempoView("40X0");

  // Assert — the movement phase reads as coaching language, not "Xs lift"
  assert.equal(view.kind, "parsed");
  if (view.kind !== "parsed") return;
  assert.equal(view.expansion, "4s lower · explosive lift");
});

test("preserves the raw code so the cryptic notation stays available on hover", () => {
  // Arrange — a padded raw string from the wire
  const view = toTempoView("  3110  ");

  // Assert — the trimmed source code is carried through for the title/hover
  assert.equal(view.kind, "parsed");
  if (view.kind !== "parsed") return;
  assert.equal(view.raw, "3110");
});

test("builds a spoken aria label with pluralised seconds for screen readers", () => {
  // Arrange — mixed singular/plural phase durations
  const view = toTempoView("3110");

  // Assert — the label reads naturally: no "·", no bare "s", correct pluralisation
  assert.equal(view.kind, "parsed");
  if (view.kind !== "parsed") return;
  assert.equal(
    view.ariaLabel,
    "Controlled tempo, 3 seconds lower, 1 second pause, 1 second lift",
  );
});

test("falls back to the raw text when the value is not 3- or 4-token notation", () => {
  // Arrange — the AI emitted free text instead of a tempo code
  const view = toTempoView("controlled");

  // Assert — shown verbatim, never a fabricated interpretation
  assert.equal(view.kind, "raw");
  if (view.kind !== "raw") return;
  assert.equal(view.raw, "controlled");
});

test("falls back to raw for a token count that is not 3 or 4", () => {
  // Arrange — a five-number string is not tempo notation
  const view = toTempoView("1-2-3-4-5");

  // Assert — verbatim fallback, no guessing
  assert.equal(view.kind, "raw");
});

test("renders nothing when there is no tempo", () => {
  // Arrange / Act — a prescription with no tempo, or only whitespace
  // Assert — no row is rendered for either
  assert.equal(toTempoView(null).kind, "none");
  assert.equal(toTempoView(undefined).kind, "none");
  assert.equal(toTempoView("   ").kind, "none");
});

test("treats a 0-second lift as explosive, the same as an X marker", () => {
  // Arrange — 3s lower, 1s pause, no deliberate lift time
  const view = toTempoView("3-1-0");

  // Assert — a 0 movement phase means as-fast-as-possible, like X
  assert.equal(view.kind, "parsed");
  if (view.kind !== "parsed") return;
  assert.equal(view.label, "Explosive");
  assert.equal(view.expansion, "3s lower · 1s pause · explosive lift");
});

test("supports multi-digit phases when the code is separated", () => {
  // Arrange — a 10s eccentric hold, only unambiguous with separators
  const view = toTempoView("10-0-2-0");

  // Assert — the multi-digit phase survives and reads Slow
  assert.equal(view.kind, "parsed");
  if (view.kind !== "parsed") return;
  assert.equal(view.expansion, "10s lower · 2s lift");
  assert.equal(view.label, "Slow");
});

test("labels a heavily paused tempo Slow even with a short eccentric", () => {
  // Arrange — a 2s lower but long pauses at both ends (2s total pause reached)
  const view = toTempoView("2-1-2-1");

  // Assert — the accumulated pause time crosses into the Slow state
  assert.equal(view.kind, "parsed");
  if (view.kind !== "parsed") return;
  assert.equal(view.label, "Slow");
});
