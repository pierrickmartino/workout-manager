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
  assert.equal(aurora?.colors.get("amber"), "#925200");
  assert.equal(aurora?.colors.get("cyan"), "#0e6d66");
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
  assert.match(report, /0 failing pairings: 0 flat, 0 composite/);
  assert.match(report, /Earlier audit scope: 0 failing pairings: 0 flat, 0 composite/);
  assert.match(report, /pulse light \| composite \| magenta \| magenta-dim \| elevated \|.*4\.6[0-9] \| PASS/);
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
    ["base", "6.01"], ["surface", "5.76"], ["elevated", "5.47"],
  ]);
  assert.equal(cyan.bindingSurface, "elevated");
  assert.equal(cyan.passes, true);
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
  assert.equal(button.ratio.toFixed(2), "6.01");
  assert.deepEqual(button.measurements.map(({ background }) => background), ["#066d7d", "#066d7d", "#066d7d"]);
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

test("retuned magenta-on-tint clears the floor in the browser audit Skins", () => {
  // Arrange
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  // Act
  const matrix = buildContrastMatrix(css).filter(({ skin, mode, isSystem }) =>
    ["pulse", "vercel", "track"].includes(skin) && mode === "light" && !isSystem);
  // Assert
  assert.deepEqual(matrix.map(({ skin, pairings }) => [skin,
    pairings.find(({ kind, text }) => kind === "composite" && text === "magenta")!.ratio.toFixed(2)]), [
    ["pulse", "4.61"], ["vercel", "4.60"], ["track", "4.62"],
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

test("unclassified colour tokens fail closed instead of escaping the registry", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const declaration of ["--color-new-accent: #fff;", "--color-new-accent : #fff;"]) {
    assert.throws(() => buildContrastMatrix(css.replace("@theme {", `@theme { ${declaration}`)),
      /pulse dark: unclassified --color-new-accent/);
  }
});

test("the Contrast Floor rejects an AA-passing pairing below its safety margin", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const pulse = parseColorBlocks(css)[0];
  const block = { ...pulse, colors: new Map([...pulse.colors,
    ["base", "#fff"], ["surface", "#fff"], ["elevated", "#fff"], ["cyan", "#767676"]]) };
  const cyan = enumerateFlatPairings(block).find(({ text }) => text === "cyan")!;
  assert.ok(cyan.ratio >= 4.5 && cyan.ratio < 4.6);
  assert.equal(cyan.passes, false);
});

test("colour overrides outside complete variants cannot bypass the guard", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.throws(() => buildContrastMatrix(css +
    '\n[data-skin="pulse"][data-mode="light"] { --color-new-text: #fff; }'),
    /pulse light: colour override without --color-base/);
});
