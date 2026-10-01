import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { importComponent } from "./offline-tsx.ts";

// ADR-0104: a focus indicator is drawn, not tinted. The Reference Atlas figure's
// selectable regions are SVG groups, and their only feedback used to be the overlay fill
// the hover state also uses — so a keyboard reader traversing ~20 muscles saw a shade
// change on an already-tinted shape, if anything at all.
//
// Two halves, and they answer different questions: the figure renders the ring (asserted
// by rendering it), and the stylesheet makes the ring visible on focus and invisible
// otherwise (asserted by reading the stylesheet, so the test holds the real rule rather
// than a copy of its text).

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function renderFigure(interactive: boolean): Document {
  const { ReferenceAtlasFigure } = importComponent(
    "components/analytics/reference-atlas-figure.tsx",
  );
  const markup = renderToStaticMarkup(React.createElement(ReferenceAtlasFigure, {
    figure: "male",
    half: "front",
    regionsByMuscle: new Map(),
    selectedMuscle: null,
    onSelectMuscle: () => {},
    interactive,
  }));
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
}

// The declarations of the rule whose selector is *exactly* this one, with whitespace
// collapsed. Matched on the whole selector rather than by substring: `.atlas-region-ring`
// also occurs inside `.atlas-region:focus-visible .atlas-region-ring`, so a substring
// search would be right only by the order the two happen to be authored in.
function ruleBody(selector: string): string {
  // Comments first: a rule's own explanation sits between the previous `}` and its `{`,
  // so it would otherwise be read as part of the selector (as `parseColorBlocks` does).
  const blocks = [...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1].trim() === selector);
  assert.equal(blocks.length, 1,
    `globals.css should declare exactly one rule for ${selector}, saw ${blocks.length}`);
  return blocks[0][2].replace(/\s+/g, " ").trim();
}

test("every selectable region carries a drawn ring per path", () => {
  // Arrange & Act
  const document = renderFigure(true);

  // Assert — one ring path per region path, so the indicator traces the whole muscle and
  // not just its first shape.
  const regions = [...document.querySelectorAll("g.atlas-region")];
  assert.ok(regions.length > 5, `expected the figure's selectable regions, saw ${regions.length}`);
  for (const region of regions) {
    // The figure draws each of a region's shapes three times: the neutral anatomy base,
    // the heat overlay, and now the ring. So there is one ring per shape, and a region
    // whose second shape had no ring would be half-outlined on focus.
    const shapes = region.querySelectorAll(":scope > g").length;
    const rings = region.querySelectorAll("path.atlas-region-ring").length;
    const unringed = region.querySelectorAll("path:not(.atlas-region-ring)").length;
    assert.equal(rings, shapes, `${region.getAttribute("aria-label")}: one ring per shape`);
    assert.equal(unringed, shapes * 2, "the base and overlay paths are unchanged");
    assert.equal(region.getAttribute("role"), "button");
  }
});

test("the ring is the element the stylesheet's focus rule can reach", () => {
  // Arrange & Act
  const region = renderFigure(true).querySelector("g.atlas-region")!;

  // Assert — the focus rule is `.atlas-region:focus-visible .atlas-region-ring`, so both
  // classes have to be on the rendered elements for it to apply at all.
  assert.ok(region.classList.contains("atlas-region"));
  assert.ok(region.classList.contains("outline-none"), "the drawn ring replaces the outline");
  const ring = region.querySelector("path.atlas-region-ring")!;
  assert.equal(ring.getAttribute("aria-hidden"), "true");
  // No inline style: an inline stroke is exactly what stops a stylesheet rule from
  // winning, which is why this is a third path and not the overlay's own stroke.
  assert.equal(ring.getAttribute("style"), null);
});

test("a read-only figure draws no ring, because nothing in it takes focus", () => {
  // Arrange & Act
  const document = renderFigure(false);

  // Assert
  assert.equal(document.querySelectorAll("path.atlas-region-ring").length, 0);
  assert.equal(document.querySelectorAll("g.atlas-region").length, 0);
  assert.equal(document.querySelectorAll("[tabindex]").length, 0);
});

test("the ring is inert at rest and a 2px accent stroke on keyboard focus", () => {
  // Arrange
  const resting = ruleBody(".atlas-region-ring");
  const focused = ruleBody(".atlas-region:focus-visible .atlas-region-ring");

  // Act / Assert — at rest it must paint nothing, or the figure would be outlined in
  // cyan everywhere.
  assert.match(resting, /fill: none/);
  assert.match(resting, /stroke: transparent/);
  assert.match(resting, /pointer-events: none/);
  // On focus it is a Skin accent, so it re-tints per Skin, and it is 2px on screen
  // whatever the figure is scaled to.
  assert.match(focused, /stroke: var\(--color-cyan\)/);
  assert.match(focused, /stroke-width: 2/);
  assert.match(resting, /vector-effect: non-scaling-stroke/);
});
