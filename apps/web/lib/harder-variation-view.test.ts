import { test } from "node:test";
import assert from "node:assert/strict";

import { toHarderVariationOffer } from "./harder-variation-view.ts";

// `toHarderVariationOffer` turns the backend's `suggested_variation` (or its
// absence) into the display model the offer card renders. Pure and server-free:
// the decision of whether to show the offer, and its honest copy, live here so the
// component stays thin.

test("shows no offer when the prescription holds at its ceiling (null)", () => {
  // Arrange — the endpoint returns null: no harder Variation on file
  // Act
  const offer = toHarderVariationOffer(null);

  // Assert — nothing to render; the prescription holds unchanged
  assert.equal(offer.kind, "none");
});

test("offers the named harder Variation, carrying its exercise id to accept", () => {
  // Arrange — the backend offers Pull-Up as the next harder Variation
  const offer = toHarderVariationOffer({ exercise_id: 42, name: "Pull-Up" });

  // Assert — the offer carries what the accept POST needs: the target exercise id
  assert.equal(offer.kind, "offer");
  if (offer.kind !== "offer") return;
  assert.equal(offer.exerciseId, 42);
  assert.equal(offer.name, "Pull-Up");
});

test("names the Variation in honest copy free of banned phrasing", () => {
  // Arrange — the offer for advancing to Pull-Up
  const offer = toHarderVariationOffer({ exercise_id: 42, name: "Pull-Up" });

  // Assert — copy names the Variation so the user knows what they're advancing to
  assert.equal(offer.kind, "offer");
  if (offer.kind !== "offer") return;
  const copy = `${offer.headline} ${offer.body} ${offer.acceptLabel}`;
  assert.match(copy, /Pull-Up/);
  // Honest copy: none of the deliberately-avoided load/PR phrasing (CONTEXT)
  assert.doesNotMatch(copy.toLowerCase(), /personal best|max weight|rep[- ]max/);
});

test("shows no offer for a blank Variation name", () => {
  // Arrange — a malformed suggestion whose name is only whitespace
  const offer = toHarderVariationOffer({ exercise_id: 42, name: "   " });

  // Assert — never render a nameless offer
  assert.equal(offer.kind, "none");
});

test("trims surrounding whitespace from the Variation name", () => {
  // Arrange — a padded name from the wire
  const offer = toHarderVariationOffer({ exercise_id: 42, name: "  Pull-Up  " });

  // Assert — the rendered name and copy carry the trimmed value
  assert.equal(offer.kind, "offer");
  if (offer.kind !== "offer") return;
  assert.equal(offer.name, "Pull-Up");
  assert.match(offer.acceptLabel, /Advance to Pull-Up$/);
});
