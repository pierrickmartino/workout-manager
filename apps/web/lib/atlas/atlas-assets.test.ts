import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FIGURES, VIEWS, type Figure, type Side, type View } from "./atlas-geometry.ts";
import { CANONICAL_MUSCLE_IDS, MUSCLE_SPECS } from "./muscle-figure-spec.ts";
import {
  buildFigureSvg,
  buildManifest,
  figureFileName,
  manifestJson,
  occurrencesOf,
} from "./atlas-build.ts";

// The asset contract for the anatomical Muscle Atlas (issue #542). These tests treat the
// committed SVGs and manifest as the deliverable and assert the load-bearing guarantees the
// consuming UI tickets will rely on: every canonical Muscle has an addressable path in every
// figure, every path's `data-muscle-id` is a real canonical id (no orphans, no typos), the
// manifest is a faithful figure-agnostic index of those paths, fills/strokes are CSS-variable
// driven so heat and light/dark theming work without editing the asset, and the committed files
// still match their source spec (a regenerate-and-commit guard). The canonical id list is
// cross-checked against the Python `MUSCLE_ORDER` in
// `apps/api/tests/test_atlas_muscle_contract.py`, so "canonical" here can never drift from #539.

const ATLAS_DIR = import.meta.dirname;
const FIGURES_DIR = join(ATLAS_DIR, "figures");

function readFigure(figure: Figure, view: View): string {
  return readFileSync(join(FIGURES_DIR, figureFileName(figure, view)), "utf8");
}

interface ParsedPath {
  id: string;
  side: Side;
}

// Pull the addressable muscle paths out of an SVG document by their controlled attribute shape.
// The silhouette paths carry no `data-muscle-id`, so they are ignored — exactly the boundary a
// consumer draws when it wires heat onto muscles.
function parseMusclePaths(svg: string): ParsedPath[] {
  const out: ParsedPath[] = [];
  const re = /<path class="atlas-muscle" data-muscle-id="([^"]*)" data-side="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(svg)) !== null) {
    out.push({ id: match[1], side: match[2] as Side });
  }
  return out;
}

const CANONICAL_SET = new Set(CANONICAL_MUSCLE_IDS);

test("the canonical id list is the 40 real muscles with no duplicates", () => {
  assert.equal(CANONICAL_MUSCLE_IDS.length, 40);
  assert.equal(CANONICAL_SET.size, 40, "canonical ids must be unique");
  assert.ok(!CANONICAL_SET.has("Unclassified"), "Unclassified is never an atlas muscle");
});

test("all three figures and both views are committed and non-trivial", () => {
  for (const figure of FIGURES) {
    for (const view of VIEWS) {
      const svg = readFigure(figure, view);
      assert.ok(svg.startsWith("<svg"), `${figure}-${view} is a real SVG document`);
      assert.ok(svg.includes(`viewBox="0 0 220 640"`), `${figure}-${view} uses the shared viewBox`);
    }
  }
});

test("every canonical Muscle has at least one addressable path in every figure", () => {
  for (const figure of FIGURES) {
    const present = new Set<string>();
    for (const view of VIEWS) {
      for (const path of parseMusclePaths(readFigure(figure, view))) {
        present.add(path.id);
      }
    }
    for (const id of CANONICAL_MUSCLE_IDS) {
      assert.ok(present.has(id), `${figure} is missing a path for "${id}"`);
    }
    assert.equal(present.size, 40, `${figure} covers exactly the 40 canonical muscles`);
  }
});

test("every data-muscle-id in every asset is a canonical Muscle id (no orphans or typos)", () => {
  for (const figure of FIGURES) {
    for (const view of VIEWS) {
      for (const path of parseMusclePaths(readFigure(figure, view))) {
        assert.ok(
          CANONICAL_SET.has(path.id),
          `${figure}-${view} has an unknown data-muscle-id "${path.id}"`,
        );
      }
    }
  }
});

test("the same muscle-id contract holds across all three figures (figure-agnostic)", () => {
  // Per view, the (id, side) set must be identical for neutral, male, and female — the figures
  // differ only in proportion, never in which muscles are addressable or where they sit.
  for (const view of VIEWS) {
    const signatures = FIGURES.map((figure) =>
      parseMusclePaths(readFigure(figure, view))
        .map((path) => `${path.id}|${path.side}`)
        .sort()
        .join(","),
    );
    assert.equal(signatures[1], signatures[0], `male ${view} differs from neutral`);
    assert.equal(signatures[2], signatures[0], `female ${view} differs from neutral`);
  }
});

test("muscle fills and strokes are driven only by CSS variables, never literal colors", () => {
  for (const figure of FIGURES) {
    for (const view of VIEWS) {
      const svg = readFigure(figure, view);
      // No hardcoded fill/stroke attribute on any element — theming rides entirely on the classes
      // and their custom properties, so a caller can recolor a muscle by setting a variable.
      assert.ok(!/\sfill="(?!none)/.test(svg), `${figure}-${view} has a literal fill attribute`);
      assert.ok(!/\sstroke="/.test(svg), `${figure}-${view} has a literal stroke attribute`);
      // The muscle class binds to the themeable custom property.
      assert.ok(
        svg.includes(".atlas-muscle { fill: var(--atlas-muscle-fill)"),
        `${figure}-${view} muscle fill is not variable-driven`,
      );
      // A light/dark contract is embedded so the standalone asset renders in both themes.
      assert.ok(
        svg.includes("@media (prefers-color-scheme: dark)"),
        `${figure}-${view} has no dark-theme block`,
      );
    }
  }
});

test("the manifest maps exactly the canonical muscles, in canonical order, each with a group", () => {
  const manifest = buildManifest();
  assert.deepEqual(Object.keys(manifest.muscles), CANONICAL_MUSCLE_IDS);
  const groups = new Set(["Legs", "Chest", "Back", "Shoulders", "Arms", "Core"]);
  for (const [id, entry] of Object.entries(manifest.muscles)) {
    assert.ok(entry.occurrences.length > 0, `manifest lists no path for "${id}"`);
    assert.ok(groups.has(entry.group), `"${id}" has an unknown group "${entry.group}"`);
  }
  assert.equal(manifest.muscleCount, 40);
});

test("the manifest's occurrences match the paths actually drawn in every figure", () => {
  const manifest = buildManifest();
  // The manifest is figure-agnostic, so its (view, side) occurrences per muscle must equal the
  // paths present in each figure — the promise that a consumer can trust the manifest without
  // parsing SVG, for whichever figure it renders.
  for (const figure of FIGURES) {
    const drawn = new Map<string, string[]>();
    for (const view of VIEWS) {
      for (const path of parseMusclePaths(readFigure(figure, view))) {
        const key = drawn.get(path.id) ?? [];
        key.push(`${view}|${path.side}`);
        drawn.set(path.id, key);
      }
    }
    for (const [id, entry] of Object.entries(manifest.muscles)) {
      const expected = entry.occurrences.map((occ) => `${occ.view}|${occ.side}`).sort();
      const actual = (drawn.get(id) ?? []).sort();
      assert.deepEqual(actual, expected, `${figure}: paths for "${id}" disagree with the manifest`);
    }
  }
});

test("bilateral muscles are drawn as a left/right pair, center muscles once", () => {
  for (const spec of MUSCLE_SPECS) {
    for (const occ of occurrencesOf(spec)) {
      if (spec.symmetry === "center") {
        assert.equal(occ.side, "center", `${spec.id} center shape must be centered`);
      } else {
        assert.notEqual(occ.side, "center", `${spec.id} bilateral shape must sit off-center`);
      }
    }
    if (spec.symmetry === "bilateral") {
      const sides = new Set(occurrencesOf(spec).map((occ) => occ.side));
      assert.ok(sides.has("left") && sides.has("right"), `${spec.id} must have both sides`);
    }
  }
});

test("the committed assets match the source spec (regenerate-and-commit guard)", () => {
  // If this fails, the spec changed without re-running `node scripts/generate-atlas.mts` — the
  // committed artwork and its source have drifted.
  for (const figure of FIGURES) {
    for (const view of VIEWS) {
      assert.equal(
        readFigure(figure, view),
        buildFigureSvg(figure, view),
        `${figure}-${view}.svg is stale — regenerate the atlas`,
      );
    }
  }
  assert.equal(
    readFileSync(join(ATLAS_DIR, "manifest.json"), "utf8"),
    manifestJson(),
    "manifest.json is stale — regenerate the atlas",
  );
});
