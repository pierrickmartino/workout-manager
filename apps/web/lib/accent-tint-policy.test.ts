import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyBackground,
  declaredColourTokens,
  findAccentTintViolations,
  findColourUses,
  formatTintViolations,
  readColourUtility,
  UNIVERSAL_COLOURS,
} from "./accent-tint-policy.ts";
import { ACCENTS, GRAPHIC_FILLS, parseColorBlocks } from "./skin-contrast-matrix.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

function skinBlocks() {
  return parseColorBlocks(readFileSync(resolve(webRoot, "app/globals.css"), "utf8"));
}

test("reads the colour a background, border or ring utility names", () => {
  // Arrange
  const utilities = ["bg-cyan/15", "border-danger", "ring-cyan/60", "fill-cyan", "accent-magenta"];
  // Act
  const colours = utilities.map(readColourUtility);
  // Assert
  assert.deepEqual(colours, [
    { prefix: "bg", token: "cyan", alpha: 0.15, raw: "15" },
    { prefix: "border", token: "danger", alpha: null, raw: "" },
    { prefix: "ring", token: "cyan", alpha: 0.6, raw: "60" },
    { prefix: "fill", token: "cyan", alpha: null, raw: "" },
    { prefix: "accent", token: "magenta", alpha: null, raw: "" },
  ]);
});

test("tells a colour apart from a same-prefixed width, style or position", () => {
  // Arrange: every one of these shares a prefix with a colour utility.
  const utilities = [
    "border-t", "border-b-0", "border-2", "border-dashed", "ring-2", "ring-offset-2",
    "outline-none", "divide-y", "shadow-2xl", "shadow-[0_0_6px_rgba(34,211,238,0.7)]",
    "bg-gradient-to-r", "bg-clip-text", "text-[11px]", "text-center",
  ];
  // Act
  const colours = utilities.map(readColourUtility);
  // Assert
  assert.deepEqual(colours.filter((colour) => colour !== null), []);
});

test("keeps ring-offset's colour distinct from ring's", () => {
  // Arrange & Act
  const offset = readColourUtility("ring-offset-base");
  const ring = readColourUtility("ring-cyan");
  // Assert
  assert.deepEqual(offset, { prefix: "ring-offset", token: "base", alpha: null, raw: "" });
  assert.deepEqual(ring, { prefix: "ring", token: "cyan", alpha: null, raw: "" });
});

test("classifies a call-site alpha by whether the colour beneath it is decidable", () => {
  // Arrange: an accent tint composites against a known Skin surface; translucent
  // chrome composites against whatever scrolls beneath it, which source cannot see.
  const backgrounds: [string, number | null][] = [
    ["cyan", 0.15], ["cyan", null], ["cyan-dim", null],
    ["surface", 0.95], ["base", 0.4], ["black", 0.6], ["text-muted", null],
  ];
  // Act
  const classes = backgrounds.map(([token, alpha]) => classifyBackground(token, alpha).kind);
  // Assert
  assert.deepEqual(classes, [
    "accent-tint", "opaque", "opaque", "harness", "harness", "harness", "opaque",
  ]);
});

test("collects every colour a component names, with its line", () => {
  // Arrange
  const source = `export const A = () => <p className="bg-cyan-dim text-cyan">Chip</p>;`;
  // Act
  const uses = findColourUses(source, "a.tsx");
  // Assert
  assert.deepEqual(uses.map(({ token, prefix, line }) => [prefix, token, line]),
    [["bg", "cyan-dim", 1], ["text", "cyan", 1]]);
});

test("fails closed on a colour no Skin declares", () => {
  // Arrange: --color-danger is declared nowhere, so its hover state does nothing.
  const source = `export const A = () => <button className="hover:border-danger/60 hover:text-danger" />;`;
  // Act
  const violations = findAccentTintViolations(source, "a.tsx", skinBlocks());
  // Assert
  assert.deepEqual(violations.map(({ failure }) => failure.kind),
    ["undeclared-colour", "undeclared-colour"]);
  assert.match(formatTintViolations(violations), /--color-danger/);
});

test("accepts the universal CSS colours, which belong to no Skin", () => {
  // Arrange
  const source = `export const A = () => <div className="bg-black/60 bg-transparent border-current" />;`;
  // Act
  const violations = findAccentTintViolations(source, "a.tsx", skinBlocks());
  // Assert
  assert.deepEqual(violations, []);
  assert.ok(UNIVERSAL_COLOURS.includes("transparent"));
});

test("rejects an accent tint that no declared pairing carries the text of", () => {
  // Arrange: cyan text on a 15% cyan tint measures 4.42:1 in Vercel Light.
  const source = `export const A = () => <span className="bg-cyan/15 text-cyan">3</span>;`;
  // Act
  const violations = findAccentTintViolations(source, "a.tsx", skinBlocks());
  // Assert
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0].failure, { kind: "undeclared-pairing", text: "cyan" });
});

test("accepts an accent tint the pairing registry declares with that text", () => {
  // Arrange: the primary button's hover fill is declared at 90%.
  const source = `export const A = () => <button className="bg-cyan text-on-accent hover:bg-cyan/90" />;`;
  // Act
  const violations = findAccentTintViolations(source, "a.tsx", skinBlocks());
  // Assert
  assert.deepEqual(violations, []);
});

test("pairs a fill only with text that can render in the same state", () => {
  // Arrange: a disabled control is never hovered, so its muted label and the
  // hover fill never meet — requiring that pairing would be a false failure.
  const source = `export const A = () => <button className="text-magenta hover:bg-magenta-dim`
    + ` disabled:text-text-muted disabled:hover:bg-elevated" />;`;
  // Act
  const violations = findAccentTintViolations(source, "a.tsx", skinBlocks());
  // Assert
  assert.deepEqual(violations, []);
});

test("rejects an accent tint with no text beside it unless it is a registered graphic", () => {
  // Arrange: text can arrive from a descendant, which one class string cannot see.
  const source = `export const A = () => <div className="rounded-lg border border-cyan/40 bg-cyan/5" />;`;
  // Act
  const violations = findAccentTintViolations(source, "a.tsx", skinBlocks());
  // Assert
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0].failure, { kind: "undeclared-pairing", text: null });
  assert.match(formatTintViolations(violations), /bg-cyan\/5/);
});

test("accepts a registered graphic fill, which carries no text at all", () => {
  // Arrange
  const registered = GRAPHIC_FILLS[0];
  const source = `export const A = () => <span className="${registered.utility}" />;`;
  // Act
  const violations = findAccentTintViolations(source, registered.file, skinBlocks());
  // Assert
  assert.deepEqual(violations, []);
});

test("leaves translucent chrome to the browser harness rather than guessing", () => {
  // Arrange: a sticky bar and a scrim composite against whatever scrolls beneath.
  const source = `export const A = () => <div className="sticky bg-surface/95 text-text-primary" />;`;
  // Act
  const violations = findAccentTintViolations(source, "a.tsx", skinBlocks());
  // Assert
  assert.deepEqual(violations, []);
});

test("fails closed on an alpha it cannot read", () => {
  // Arrange
  const source = `export const A = () => <span className="bg-cyan/[var(--tint)] text-cyan" />;`;
  // Act
  const violations = findAccentTintViolations(source, "a.tsx", skinBlocks());
  // Assert
  assert.equal(violations.length, 1);
  assert.equal(violations[0].failure.kind, "unreadable-alpha");
});

test("every colour a component names is one the Skins declare", () => {
  // Arrange
  const files = componentSources();
  const blocks = skinBlocks();
  // Act
  const violations = files.flatMap((file) =>
    findAccentTintViolations(readFileSync(resolve(webRoot, file), "utf8"), file, blocks)
      .filter(({ failure }) => failure.kind === "undeclared-colour"));
  // Assert
  assert.equal(violations.length, 0, `\n${formatTintViolations(violations)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("no component paints text on an accent tint the registry does not declare", () => {
  // Arrange
  const files = componentSources();
  const blocks = skinBlocks();
  // Act
  const violations = files.flatMap((file) =>
    findAccentTintViolations(readFileSync(resolve(webRoot, file), "utf8"), file, blocks));
  // Assert
  assert.equal(violations.length, 0, `\n${formatTintViolations(violations)}\n`);
});

test("records the translucent chrome it leaves to the harness instead of omitting it", () => {
  // Arrange: sticky bars, scrims and drawer backdrops composite against whatever
  // scrolls beneath them, which one class string cannot see (ADR-0083, ADR-0086).
  const files = componentSources();
  // Act
  const harness = files.flatMap((file) =>
    findColourUses(readFileSync(resolve(webRoot, file), "utf8"), file)
      .filter((use) => use.prefix === "bg" && classifyBackground(use.token, use.alpha).kind === "harness"));
  // Assert
  const tokens = [...new Set(harness.map(({ token }) => token))].sort();
  assert.deepEqual(tokens, ["base", "black", "elevated", "surface"]);
  assert.ok(harness.length >= 25, `expected the chrome cases to be classified, saw ${harness.length}`);
  assert.deepEqual(harness.filter(({ token }) => (ACCENTS as readonly string[]).includes(token)), []);
});

test("the Skins declare more colours than the accents this rule measures", () => {
  // Arrange & Act
  const declared = declaredColourTokens(skinBlocks());
  // Assert
  assert.ok(declared.has("cyan-dim") && declared.has("text-muted") && declared.has("elevated"));
  assert.equal(declared.has("danger"), false);
});

test("every registered graphic fill still names a component that carries it", () => {
  // Arrange
  const files = componentSources();
  // Act & Assert
  for (const { file, utility } of GRAPHIC_FILLS) {
    assert.ok(files.includes(file), `${file} is not a component source`);
    assert.ok(readFileSync(resolve(webRoot, file), "utf8").includes(utility),
      `${file} no longer carries ${utility}`);
  }
});
