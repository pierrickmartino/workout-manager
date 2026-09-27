import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildContrastMatrix, CONTRAST_FLOOR } from "./skin-contrast-matrix.ts";

// ADR-0081: check the authored source, including System Mode copies.
const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("every flat and declared composite pairing clears the Contrast Floor", () => {
  const matrix = buildContrastMatrix(CSS);
  assert.ok(matrix.length >= 12, "expected every Skin × Mode variant");
  const failures = matrix.flatMap(({ skin, mode, isSystem, pairings }) =>
    pairings.flatMap(({ text, background, measurements }) => measurements
      .filter(({ ratio }) => ratio < CONTRAST_FLOOR)
      .map(({ surface, ratio }) =>
        `${skin} ${mode}${isSystem ? " (System)" : ""}: ${text} on ${background} over ${surface} = ${ratio.toFixed(3)}:1 < ${CONTRAST_FLOOR}:1`)));
  assert.deepEqual(failures, [], `Contrast Floor violations (ADR-0081):\n${failures.join("\n")}`);
});
