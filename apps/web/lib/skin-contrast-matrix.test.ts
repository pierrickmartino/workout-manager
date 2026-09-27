import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseColorBlocks, compositeTint, enumerateFlatPairings, enumerateCompositePairings, buildContrastMatrix, formatContrastReport } from "./skin-contrast-matrix.ts";

test("resolves inherited colours and System Mode light overrides from the token source", () => {
  // Arrange
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  // Act
  const blocks = parseColorBlocks(css);
  // Assert
  assert.equal(blocks.length, 18);
  assert.equal(blocks.filter((block) => block.isSystem).length, 6);
  const aurora = blocks.find((block) => block.skin === "aurora" && block.mode === "light");
  assert.equal(aurora?.colors.get("amber"), "#ffb454");
  assert.equal(aurora?.colors.get("cyan"), "#0f766e");
});

test("preserves System Mode copies when their values differ from explicit Light Mode", () => {
  // Arrange
  const css = `/* ignored { --color-base: #bad; } */
    @theme { --color-base: #000; --color-text-muted: #fff; }
    @layer theme {
      [data-skin="sample"][data-mode="light"] { --color-base: #fff; }
      @media (prefers-color-scheme: light) {
        [data-skin="sample"]:not([data-mode]) { --color-base: #eee; }
      }
    }`;
  // Act
  const blocks = parseColorBlocks(css);
  // Assert
  assert.deepEqual(blocks.map(({ skin, mode, isSystem, colors }) =>
    [skin, mode, isSystem, colors.get("base"), colors.get("text-muted")]), [
    ["pulse", "dark", false, "#000", "#fff"],
    ["sample", "light", false, "#fff", "#fff"],
    ["sample", "light", true, "#eee", "#fff"],
  ]);
});

test("reports every surface measurement and the binding surface as written evidence", () => {
  // Arrange
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  // Act
  const report = formatContrastReport(buildContrastMatrix(css));
  // Assert
  assert.match(report, /50 failing pairings: 18 flat, 32 composite/);
  assert.match(report, /Earlier audit scope: 29 failing pairings: 8 flat, 21 composite/);
  assert.match(report, /pulse light \| composite \| magenta \| magenta-dim \| elevated \|.*3\.51 \| FAIL/);
  assert.match(report, /pulse light \(System\)/);
});

test("enumerates the Text Ramp and six text accents against all three surfaces", () => {
  // Arrange
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const pulse = parseColorBlocks(css).find(({ skin, mode }) => skin === "pulse" && mode === "light")!;
  // Act
  const pairings = enumerateFlatPairings(pulse);
  // Assert
  assert.deepEqual(pairings.map(({ text }) => text), [
    "text-primary", "text-secondary", "text-muted", "cyan", "blue", "violet", "magenta", "amber", "green",
  ]);
  assert.equal(pairings.flatMap(({ measurements }) => measurements).length, 27);
  const cyan = pairings.find(({ text }) => text === "cyan")!;
  assert.deepEqual(cyan.measurements.map(({ surface, ratio }) => [surface, ratio.toFixed(2)]), [
    ["base", "3.75"], ["surface", "3.59"], ["elevated", "3.41"],
  ]);
  assert.equal(cyan.bindingSurface, "elevated");
  assert.equal(cyan.passes, false);
});

test("enumerates declared tint and primary button pairings without inventing a blue tint", () => {
  // Arrange
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const pulse = parseColorBlocks(css).find(({ skin, mode }) => skin === "pulse" && mode === "light")!;
  // Act
  const pairings = enumerateCompositePairings(pulse);
  // Assert
  assert.deepEqual(pairings.map(({ text, background }) => [text, background]), [
    ["cyan", "cyan-dim"], ["violet", "violet-dim"], ["magenta", "magenta-dim"],
    ["amber", "amber-dim"], ["green", "green-dim"], ["on-accent", "cyan"],
  ]);
  const button = pairings.find(({ text }) => text === "on-accent")!;
  assert.equal(button.ratio.toFixed(2), "3.75");
  assert.deepEqual(button.measurements.map(({ background }) => background), ["#0891a5", "#0891a5", "#0891a5"]);
});

test("composites an explicit alpha in sRGB before measuring contrast", () => {
  // Arrange
  const foreground = "#000";
  const background = "#ffffff";
  // Act
  const half = compositeTint(foreground, background, 0.5);
  const transparent = compositeTint(foreground, background, 0);
  const opaque = compositeTint(foreground, background, 1);
  // Assert
  assert.equal(half, "#808080");
  assert.equal(transparent, "#ffffff");
  assert.equal(opaque, "#000000");
});

test("rejects invalid alpha values instead of scoring an impossible tint", () => {
  // Arrange
  const invalidAlphas = [-0.1, 1.1, NaN, Infinity];
  // Act / Assert
  for (const alpha of invalidAlphas) {
    assert.throws(() => compositeTint("#000000", "#ffffff", alpha), /Alpha must be between 0 and 1/);
  }
});

test("selects the actual binding surface rather than assuming elevated always binds", () => {
  // Arrange
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const pulse = parseColorBlocks(css)[0];
  const block = { ...pulse, colors: new Map([...pulse.colors, ["base", "#ffffff"],
    ["surface", "#333333"], ["elevated", "#000000"], ["cyan", "#ffffff"]]) };
  // Act
  const cyan = enumerateFlatPairings(block).find(({ text }) => text === "cyan")!;
  // Assert
  assert.equal(cyan.bindingSurface, "base");
  assert.equal(cyan.ratio, 1);
  assert.equal(cyan.measurements.find(({ surface }) => surface === "elevated")?.ratio, 21);
});

test("reproduces the browser audit's magenta-on-tint measurements", () => {
  // Arrange
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  // Act
  const matrix = buildContrastMatrix(css).filter(({ skin, mode, isSystem }) =>
    ["pulse", "vercel", "track"].includes(skin) && mode === "light" && !isSystem);
  // Assert
  assert.deepEqual(matrix.map(({ skin, pairings }) => [skin,
    pairings.find(({ kind, text }) => kind === "composite" && text === "magenta")!.ratio.toFixed(2)]), [
    ["pulse", "3.51"], ["vercel", "3.74"], ["track", "3.85"],
  ]);
});

test("names missing tokens and rejects malformed colours instead of skipping pairings", () => {
  // Arrange
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const pulse = parseColorBlocks(css)[0];
  const withoutCyan = { ...pulse, colors: new Map([...pulse.colors].filter(([token]) => token !== "cyan")) };
  const invalidCyan = { ...pulse, colors: new Map([...pulse.colors, ["cyan", "not-a-color"]]) };
  // Act / Assert
  assert.throws(() => enumerateFlatPairings(withoutCyan), /pulse dark: missing --color-cyan/);
  assert.throws(() => enumerateFlatPairings(invalidCyan), /not a 6-digit hex colour/);
});

test("rejects an unclosed token block rather than reporting a truncated matrix", () => {
  // Arrange
  const css = "@theme { --color-base: #000;";
  // Act / Assert
  assert.throws(() => parseColorBlocks(css), /Unclosed CSS block/);
});
