import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  findCallSiteFades,
  findFadedTextViolations,
  formatFadeViolations,
  measureFade,
  parseAlpha,
  readTextColour,
  FADE_EXEMPTIONS,
} from "./faded-text-policy.ts";
import { parseColorBlocks } from "./skin-contrast-matrix.ts";

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

test("reads the three alpha spellings Tailwind accepts", () => {
  // Arrange
  const raws = ["80", "[0.42]", "[42%]", "", "half"];
  // Act
  const alphas = raws.map(parseAlpha);
  // Assert
  assert.deepEqual(alphas, [0.8, 0.42, 0.42, null, null]);
});

test("tells a faded colour apart from same-prefixed typography", () => {
  // Arrange
  const utilities = ["text-cyan/80", "text-[11px]", "text-sm", "text-center", "text-text-muted"];
  // Act
  const colours = utilities.map(readTextColour);
  // Assert
  assert.deepEqual(colours[0], { token: "cyan", alpha: 0.8, raw: "80" });
  assert.equal(colours[1], null);
  assert.equal(colours[2], null);
  assert.equal(colours[3], null);
  assert.deepEqual(colours[4], { token: "text-muted", alpha: 1, raw: "" });
});

test("finds a fade written as colour alpha", () => {
  // Arrange
  const source = `export const A = () => <p className="font-mono text-[11px] text-cyan/80">Previous</p>;`;
  // Act
  const fades = findCallSiteFades(source, "a.tsx");
  // Assert
  assert.equal(fades.length, 1);
  assert.equal(fades[0].token, "cyan");
  assert.equal(fades[0].alpha, 0.8);
});

test("finds the same fade written as a same-string element opacity", () => {
  // Arrange
  const source = `export const A = () => <span className="text-text-muted opacity-40">Older</span>;`;
  // Act
  const fades = findCallSiteFades(source, "a.tsx");
  // Assert
  assert.equal(fades.length, 1);
  assert.equal(fades[0].token, "text-muted");
  assert.equal(fades[0].alpha, 0.4);
  assert.deepEqual(fades[0].utilities, ["text-text-muted", "opacity-40"]);
});

test("multiplies a colour alpha by a same-string opacity", () => {
  // Arrange
  const source = `export const A = () => <span className="text-cyan/50 opacity-40">Faded twice</span>;`;
  // Act
  const fades = findCallSiteFades(source, "a.tsx");
  // Assert
  assert.equal(fades[0].alpha, 0.2);
});

test("leaves an opacity in a different class string alone", () => {
  // Arrange: an ancestor fade is not decidable from one string — see ADR-0083.
  const source = `export const A = () => <div className={cn("opacity-70", "text-text-muted")} />;`;
  // Act
  const fades = findCallSiteFades(source, "a.tsx");
  // Assert
  assert.deepEqual(fades, []);
});

test("exempts a fade behind disabled, which matches only form controls", () => {
  // Arrange
  const source = `export const A = () => <input className="text-text-primary disabled:opacity-50" />;`;
  // Act
  const fades = findCallSiteFades(source, "a.tsx");
  // Assert
  assert.deepEqual(fades, []);
});

test("does not excuse a fade because it only renders on hover", () => {
  // Arrange
  const source = `export const A = () => <a className="hover:text-cyan/40">Link</a>;`;
  // Act
  const fades = findCallSiteFades(source, "a.tsx");
  // Assert
  assert.equal(fades.length, 1);
  assert.equal(fades[0].alpha, 0.4);
});

test("passes a fade that still clears the floor in every Skin", () => {
  // Arrange: cyan at 98% is a fade, but not one that costs anything.
  const source = `export const A = () => <p className="text-cyan/98">Previous</p>;`;
  // Act
  const violations = findFadedTextViolations(source, "a.tsx", skinBlocks());
  // Assert
  assert.deepEqual(violations, []);
});

test("fails closed on a colour token the Skins do not classify", () => {
  // Arrange
  const fade = { file: "a.tsx", line: 1, token: "danger", alpha: 0.5, utilities: ["text-danger/50"] };
  // Act
  const failure = measureFade(fade, skinBlocks());
  // Assert
  assert.deepEqual(failure, { kind: "unknown-token" });
});

test("fails closed on an alpha it cannot read", () => {
  // Arrange
  const source = `export const A = () => <p className="text-cyan/[var(--dim)]">Previous</p>;`;
  // Act
  const violations = findFadedTextViolations(source, "a.tsx", skinBlocks());
  // Assert
  assert.equal(violations.length, 1);
  assert.equal(violations[0].failure.kind, "unreadable-alpha");
});

test("binds on the worst surface and names the Skin that fails", () => {
  // Arrange
  const source = `export const A = () => <p className="text-cyan/80">Previous</p>;`;
  // Act
  const violations = findFadedTextViolations(source, "a.tsx", skinBlocks());
  // Assert
  assert.equal(violations.length, 1);
  const { failure } = violations[0];
  assert.equal(failure.kind, "below-floor");
  if (failure.kind !== "below-floor") return;
  assert.ok(failure.ratio < 4.6, `expected a failing ratio, saw ${failure.ratio}`);
  assert.ok(failure.variant.length > 0);
});

test("no component fades text below the Contrast Floor", () => {
  // Arrange
  const files = componentSources();
  const blocks = skinBlocks();
  // Act
  const violations = files.flatMap((file) =>
    findFadedTextViolations(readFileSync(resolve(webRoot, file), "utf8"), file, blocks));
  // Assert
  assert.equal(violations.length, 0, `\n${formatFadeViolations(violations)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("every fade exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert: the registry ships empty; an entry must justify itself.
  for (const exemption of FADE_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file}: ${exemption.utility} has no reason`);
    assert.ok(componentSources().includes(relative(webRoot, resolve(webRoot, exemption.file))),
      `${exemption.file} is not a component source`);
  }
});
