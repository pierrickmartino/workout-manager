import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  findUnguardedMotion,
  formatMotionViolations,
  isAnimationBearing,
  isMotionBearingTransition,
  parseClassToken,
  MOTION_EXEMPTIONS,
} from "./motion-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("splits Tailwind variants without breaking arbitrary values that contain colons", () => {
  // Arrange
  const tokens = ["motion-reduce:animate-none", "animate-[pulse-sweep_1.4s_ease-in-out_infinite]", "bg-[url(a:b)]"];
  // Act
  const parsed = tokens.map(parseClassToken);
  // Assert
  assert.deepEqual(parsed[0], { variants: ["motion-reduce"], utility: "animate-none" });
  assert.deepEqual(parsed[1], { variants: [], utility: "animate-[pulse-sweep_1.4s_ease-in-out_infinite]" });
  assert.deepEqual(parsed[2], { variants: [], utility: "bg-[url(a:b)]" });
});

test("treats every animation utility as movement except the off switch", () => {
  // Arrange & Act & Assert
  assert.equal(isAnimationBearing("animate-spin"), true);
  assert.equal(isAnimationBearing("animate-[pulse-sweep_1.4s_ease-in-out_infinite]"), true);
  assert.equal(isAnimationBearing("animate-none"), false);
  assert.equal(isAnimationBearing("animation-delay-200"), false);
});

test("classifies transitions by whether their property list can move something", () => {
  // Arrange & Act & Assert
  assert.equal(isMotionBearingTransition("transition-transform"), true);
  assert.equal(isMotionBearingTransition("transition-all"), true);
  assert.equal(isMotionBearingTransition("transition"), true);
  assert.equal(isMotionBearingTransition("transition-[transform,opacity]"), true);
  // Colour and opacity change without moving, so they stay under reduced motion.
  assert.equal(isMotionBearingTransition("transition-colors"), false);
  assert.equal(isMotionBearingTransition("transition-opacity"), false);
  assert.equal(isMotionBearingTransition("transition-[fill-opacity,stroke,stroke-width]"), false);
  assert.equal(isMotionBearingTransition("transition-none"), false);
});

test("accepts a motion utility paired with its opt-out in the same class string", () => {
  // Arrange
  const source = `export const A = () => <div className="animate-spin motion-reduce:animate-none" />;`;
  // Act
  const violations = findUnguardedMotion(source, "a.tsx");
  // Assert
  assert.deepEqual(violations, []);
});

test("reports an animation that has no reduced-motion opt-out", () => {
  // Arrange
  const source = `export const A = () => <div className="h-4 w-4 animate-spin text-cyan" />;`;
  // Act
  const violations = findUnguardedMotion(source, "a.tsx");
  // Assert
  assert.deepEqual(violations, [{ file: "a.tsx", line: 1, utility: "animate-spin", kind: "animation" }]);
  assert.match(formatMotionViolations(violations), /a\.tsx:1 — animate-spin .*motion-reduce:animate-none/);
});

test("requires the opt-out to sit in the same class string as the movement it guards", () => {
  // Arrange: a pairing in a sibling argument is invisible to a reader of either.
  const source = `export const A = ({ on }) => <div className={cn("motion-reduce:animate-none", on && "animate-spin")} />;`;
  // Act
  const violations = findUnguardedMotion(source, "a.tsx");
  // Assert
  assert.deepEqual(violations.map(({ utility }) => utility), ["animate-spin"]);
});

test("rejects movement that is declared under the reduced-motion variant itself", () => {
  // Arrange
  const source = `export const A = () => <div className="motion-reduce:animate-spin motion-reduce:animate-none" />;`;
  // Act
  const violations = findUnguardedMotion(source, "a.tsx");
  // Assert
  assert.deepEqual(violations.map(({ utility }) => utility), ["animate-spin"]);
});

test("accepts movement scoped to users who accept it with motion-safe", () => {
  // Arrange
  const source = `export const A = () => <div className="motion-safe:animate-spin" />;`;
  // Act
  const violations = findUnguardedMotion(source, "a.tsx");
  // Assert
  assert.deepEqual(violations, []);
});

test("ignores class-like words in comments and in prose strings", () => {
  // Arrange: the same words appear in a comment, in copy, and as a real utility.
  const source = `// The slide transition is disabled under prefers-reduced-motion; animate-spin is not used.
export const A = () => <p title="Waiting for the transition to finish">{"animate-spin"}</p>;`;
  // Act
  const violations = findUnguardedMotion(source, "a.tsx");
  // Assert: the bare word is prose outside a class context; the quoted utility is not.
  assert.deepEqual(violations.map(({ utility }) => utility), ["animate-spin"]);
});

test("reads a bare transition token as a utility inside a class context", () => {
  // Arrange
  const source = `export const A = () => <div className="transition duration-150" />;`;
  // Act
  const violations = findUnguardedMotion(source, "a.tsx");
  // Assert
  assert.deepEqual(violations.map(({ utility, kind }) => [utility, kind]), [["transition", "transition"]]);
});

test("leaves colour and opacity transitions alone without an opt-out", () => {
  // Arrange
  const source = `export const A = () => <div className="transition-colors transition-opacity duration-150" />;`;
  // Act
  const violations = findUnguardedMotion(source, "a.tsx");
  // Assert
  assert.deepEqual(violations, []);
});

test("no component declares movement that survives the reduced-motion preference", () => {
  // Arrange
  const files = componentSources();
  // Act
  const violations = files.flatMap((file) =>
    findUnguardedMotion(readFileSync(resolve(webRoot, file), "utf8"), file));
  // Assert
  assert.equal(violations.length, 0, `\n${formatMotionViolations(violations)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("every motion exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert: the registry ships empty; an entry must justify itself.
  for (const exemption of MOTION_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file}: ${exemption.utility} has no reason`);
    assert.ok(componentSources().includes(relative(webRoot, resolve(webRoot, exemption.file))),
      `${exemption.file} is not a component source`);
  }
});
