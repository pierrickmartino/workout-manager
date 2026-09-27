import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { contrastRatio, WCAG_AA_NORMAL } from "./wcag-contrast.ts";
import { parseColorBlocks, TEXT_RUNGS, SURFACES } from "./skin-contrast-matrix.ts";

// The Contrast Floor guard (ADR-0070) — the colour analogue of the backend's
// terminology_guard. A Skin is published app-wide by an admin with no code review of
// its palette, so an accessibility floor that lived only in review would regress the
// next time a Skin is added. This test parses the *single source of truth*
// (app/globals.css) and fails CI if any rung of any Skin's Text Ramp
// (text-primary/secondary/muted) drops below WCAG AA against any surface
// (base/surface/elevated), in either Mode variant.
//
// Scope is deliberately the objective WCAG contract only (Q7a): it asserts the 4.5:1
// floor, not perceptual separation between rungs. A future Skin could keep every rung
// AA-passing yet collapse muted onto secondary — that residual risk is left to human
// design review, per ADR-0070.

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

const blocks = parseColorBlocks(CSS);

test("the guard actually found the Skin colour blocks", () => {
  // A regex that silently matched nothing would make every assertion below vacuous.
  // Three Skins × (one dark + one light) is the floor; the light System-Mode @media
  // duplicates push the real count higher.
  assert.ok(
    blocks.length >= 6,
    `expected at least 6 colour blocks, found ${blocks.length}`,
  );
});

test("every Text Ramp rung clears WCAG AA against every surface", () => {
  const failures: string[] = [];

  for (const { selector, colors } of blocks) {
    for (const rung of TEXT_RUNGS) {
      const fg = colors.get(rung);
      if (!fg) {
        failures.push(`${selector}: missing --color-${rung}`);
        continue;
      }
      for (const surface of SURFACES) {
        const bg = colors.get(surface);
        if (!bg) {
          failures.push(`${selector}: missing --color-${surface}`);
          continue;
        }
        const ratio = contrastRatio(fg, bg);
        if (ratio < WCAG_AA_NORMAL) {
          failures.push(
            `${selector}: ${rung} (${fg}) on ${surface} (${bg}) = ` +
              `${ratio.toFixed(2)}:1 < ${WCAG_AA_NORMAL}:1`,
          );
        }
      }
    }
  }

  assert.equal(
    failures.length,
    0,
    `Contrast Floor violations (ADR-0070):\n  ${failures.join("\n  ")}`,
  );
});
