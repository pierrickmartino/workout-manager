import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hexToRgb } from "./wcag-contrast.ts";
import { parseColorBlocks } from "./skin-contrast-matrix.ts";

interface Retuning {
  skin: string;
  mode: string;
  token: string;
  original: string;
  retuned: string;
  surfaces: Record<string, string>;
}

// The original colours are frozen derivation evidence, not inferred from the
// retuned CSS. Hex quantization allows <1 degree hue and <1% saturation drift.
function hueAndSaturation(hex: string): readonly [number, number] {
  const [r, g, b] = hexToRgb(hex).map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return [0, 0];
  const hue = max === r ? ((g - b) / delta + 6) % 6
    : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [hue * 60, delta / (1 - Math.abs(max + min - 1))];
}

test("retuned Accents preserve hue and saturation against their own Skin surfaces", () => {
  const evidence: Retuning[] = JSON.parse(readFileSync(
    new URL("../../../docs/development/accent-retuning.json", import.meta.url), "utf8"));
  const blocks = parseColorBlocks(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"));
  assert.equal(evidence.length, 37);
  for (const entry of evidence) {
    const label = `${entry.skin} ${entry.mode} ${entry.token}`;
    const [oldHue, oldSaturation] = hueAndSaturation(entry.original);
    const [newHue, newSaturation] = hueAndSaturation(entry.retuned);
    const hueDifference = Math.abs(oldHue - newHue);
    assert.ok(Math.min(hueDifference, 360 - hueDifference) < 1, `${label}: hue drift`);
    assert.ok(Math.abs(oldSaturation - newSaturation) < 0.01, `${label}: saturation drift`);
    const variants = blocks.filter(({ skin, mode }) => skin === entry.skin && mode === entry.mode);
    assert.ok(variants.length > 0, `${label}: missing variant`);
    for (const { colors } of variants) {
      assert.equal(colors.get(entry.token), entry.retuned, label);
      for (const [surface, value] of Object.entries(entry.surfaces)) {
        assert.equal(colors.get(surface), value, `${label}: ${surface}`);
      }
    }
  }
});
