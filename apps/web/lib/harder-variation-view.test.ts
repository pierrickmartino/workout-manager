import { test } from "node:test";
import assert from "node:assert/strict";

import {
  harderVariationOffersFor,
  toHarderVariationOffer,
} from "./harder-variation-view.ts";

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
  // Honest copy: none of the deliberately-avoided load/PR phrasing (GLOSSARY)
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

// `harderVariationOffersFor` lines the batch read (one request per Session, audit V-5)
// up with the prescriptions the page renders.

test("maps the batch read to one offer per prescription, by position", () => {
  // Arrange — the second of three movements is at its ceiling
  const offers = [
    { position: 0, suggested_variation: null },
    { position: 1, suggested_variation: { exercise_id: 7, name: "Archer Pull-Up" } },
    { position: 2, suggested_variation: null },
  ];

  // Act
  const views = harderVariationOffersFor([0, 1, 2], offers);

  // Assert
  assert.deepEqual(
    views.map((view) => view.kind),
    ["none", "offer", "none"],
  );
  assert.equal(views[1].kind === "offer" && views[1].exerciseId, 7);
});

test("matches offers by position, not by array order", () => {
  // Arrange — the read lists positions out of order
  const offers = [
    { position: 1, suggested_variation: null },
    { position: 0, suggested_variation: { exercise_id: 3, name: "Pistol Squat" } },
  ];

  // Act
  const views = harderVariationOffersFor([0, 1], offers);

  // Assert
  assert.equal(views[0].kind, "offer");
  assert.equal(views[1].kind, "none");
});

test("shows no offer anywhere when the batch read failed", () => {
  // Act
  const views = harderVariationOffersFor([0, 1], null);

  // Assert — every card still renders, just without an offer
  assert.deepEqual(views, [{ kind: "none" }, { kind: "none" }]);
});

test("shows no offer for a position the batch read left out", () => {
  // Act
  const views = harderVariationOffersFor([0, 1], [
    { position: 0, suggested_variation: null },
  ]);

  // Assert
  assert.equal(views[1].kind, "none");
});
