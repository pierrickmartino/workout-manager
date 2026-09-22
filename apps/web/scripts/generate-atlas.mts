// Generator for the anatomical Muscle Atlas assets (issue #542).
//
// Emits the six figure/view SVGs and the manifest from the canonical spec, into
// `apps/web/lib/atlas/`. The output is deterministic — re-running it with an unchanged spec
// produces byte-identical files — so the committed assets and the source stay in lockstep, and the
// asset test can rebuild and compare. Run with:
//
//   node apps/web/scripts/generate-atlas.mts
//
// (Node 22+ runs the TypeScript directly.) Commit the regenerated SVGs and manifest.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FIGURES, VIEWS } from "../lib/atlas/atlas-geometry.ts";
import { buildFigureSvg, figureFileName, manifestJson } from "../lib/atlas/atlas-build.ts";

const here = dirname(fileURLToPath(import.meta.url));
const atlasDir = join(here, "..", "lib", "atlas");
const figuresDir = join(atlasDir, "figures");

mkdirSync(figuresDir, { recursive: true });

let count = 0;
for (const figure of FIGURES) {
  for (const view of VIEWS) {
    const path = join(figuresDir, figureFileName(figure, view));
    writeFileSync(path, buildFigureSvg(figure, view), "utf8");
    count += 1;
  }
}

writeFileSync(join(atlasDir, "manifest.json"), manifestJson(), "utf8");

// eslint-disable-next-line no-console -- generator progress is intentional CLI output
console.log(`Wrote ${count} SVG figures + manifest.json to ${atlasDir}`);
