import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  NAV_BACK,
  NAV_DIRECTION_ATTRIBUTE,
  NAV_FORWARD,
  parseNavDirection,
} from "./nav-direction.ts";
import { findHandWrittenTransitionTypes } from "./nav-direction-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("a forward link carries its type for the router and the DOM alike", () => {
  // Arrange & Act & Assert: the attribute is how the navigation guard reads it back.
  assert.deepEqual(NAV_FORWARD.transitionTypes, ["nav-forward"]);
  assert.equal(NAV_FORWARD[NAV_DIRECTION_ATTRIBUTE], "nav-forward");
  assert.deepEqual(NAV_BACK.transitionTypes, ["nav-back"]);
  assert.equal(NAV_BACK[NAV_DIRECTION_ATTRIBUTE], "nav-back");
});

test("reads a direction back from an anchor attribute, and nothing else", () => {
  // Arrange & Act & Assert
  assert.equal(parseNavDirection("nav-forward"), "nav-forward");
  assert.equal(parseNavDirection("nav-back"), "nav-back");
  assert.equal(parseNavDirection(null), null);
  assert.equal(parseNavDirection("nav-sideways"), null);
  // Membership is own-property only, so a prototype key is not a direction.
  assert.equal(parseNavDirection("toString"), null);
});

test("reports a transitionTypes prop written by hand instead of spread from the registry", () => {
  // Arrange
  const source = `export const A = () => (
  <>
    <Link href="/a" {...NAV_FORWARD}>a</Link>
    <Link href="/b" transitionTypes={["nav-forwrad"]}>b</Link>
  </>
);`;
  // Act
  const lines = findHandWrittenTransitionTypes(source, "a.tsx");
  // Assert: a typo'd type matches no map key and silently does not animate.
  assert.deepEqual(lines, [{ file: "a.tsx", line: 4 }]);
});

test("no component tags a navigation except through the direction registry", () => {
  // Arrange
  const files = componentSources();
  // Act
  const found = files.flatMap((file) =>
    findHandWrittenTransitionTypes(readFileSync(resolve(webRoot, file), "utf8"), file));
  // Assert
  assert.deepEqual(found, []);
});
