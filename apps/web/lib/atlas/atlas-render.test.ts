import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveFigure, toFigureRender } from "./atlas-render.ts";
import { VIEW_BOX, VIEWS } from "./atlas-geometry.ts";
import { MUSCLE_SPECS } from "./muscle-figure-spec.ts";
import { occurrencesOf } from "./atlas-build.ts";

// `atlas-render` is the pure seam between the atlas geometry (issue #542) and the interactive
// Stats body map (issue #543): `resolveFigure` picks the figure from `Profile.gender` with a
// neutral fallback, and `toFigureRender` turns a figure/view into render-ready muscle paths in
// canonical order. These tests pin the figure-selection contract and that the render model is a
// faithful, view-filtered projection of the same geometry the committed SVG assets use.

test("resolveFigure maps the Gender enum to its figure", () => {
  assert.equal(resolveFigure("M"), "male");
  assert.equal(resolveFigure("F"), "female");
});

test("resolveFigure falls back to neutral for null, undefined, or unrecognized gender", () => {
  assert.equal(resolveFigure(null), "neutral");
  assert.equal(resolveFigure(undefined), "neutral");
  assert.equal(resolveFigure(""), "neutral");
  assert.equal(resolveFigure("nonbinary"), "neutral");
  assert.equal(resolveFigure("m"), "neutral"); // case-sensitive: only the canonical enum matches
});

test("toFigureRender carries the shared viewBox and a silhouette", () => {
  const model = toFigureRender("neutral", "front");
  assert.equal(model.viewBox, VIEW_BOX);
  assert.ok(model.silhouette.parts.length > 0);
  assert.equal(model.silhouette.head.r, 30);
});

test("toFigureRender keeps only the muscles that occur on the requested view", () => {
  for (const view of VIEWS) {
    const model = toFigureRender("neutral", view);
    const expectedIds = MUSCLE_SPECS.filter((spec) =>
      occurrencesOf(spec).some((occ) => occ.view === view),
    ).map((spec) => spec.id);
    assert.deepEqual(
      model.muscles.map((m) => m.id),
      expectedIds,
      `front/back partition and canonical order preserved for ${view}`,
    );
  }
});

test("toFigureRender emits every occurrence on the view as a non-empty path", () => {
  const model = toFigureRender("male", "front");
  for (const muscle of model.muscles) {
    assert.ok(muscle.occurrences.length >= 1, `${muscle.id} has at least one path`);
    for (const occ of muscle.occurrences) {
      assert.match(occ.d, /^M .+ Z$/, `${muscle.id} path is a closed SVG path`);
      assert.ok(["left", "right", "center"].includes(occ.side));
    }
  }
});

test("a bilateral muscle renders a left and a right occurrence", () => {
  const model = toFigureRender("neutral", "front");
  const quads = model.muscles.find((m) => m.id === "Quadriceps");
  assert.ok(quads);
  assert.deepEqual(
    quads.occurrences.map((o) => o.side).sort(),
    ["left", "right"],
  );
  // The two halves are mirror images, so their paths differ.
  assert.notEqual(quads.occurrences[0].d, quads.occurrences[1].d);
});

test("the same muscle warps to different paths on different figures", () => {
  const neutral = toFigureRender("neutral", "front").muscles.find((m) => m.id === "Deltoids");
  const female = toFigureRender("female", "front").muscles.find((m) => m.id === "Deltoids");
  assert.ok(neutral && female);
  // Deltoids sit in the shoulder band, which the female figure narrows — the warp must move them.
  assert.notEqual(neutral.occurrences[0].d, female.occurrences[0].d);
});

test("every rendered muscle carries its canonical parent group", () => {
  const model = toFigureRender("neutral", "back");
  const groupById = new Map(MUSCLE_SPECS.map((spec) => [spec.id, spec.group]));
  for (const muscle of model.muscles) {
    assert.equal(muscle.group, groupById.get(muscle.id));
  }
});
