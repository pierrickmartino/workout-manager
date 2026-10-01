import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  IMAGE_EXEMPTIONS,
  findUnreservedImages,
  formatImageViolations,
} from "./image-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("accepts an image that reserves its box and says when to fetch it", () => {
  // Arrange
  const source = `export const A = () => <img src={src} alt="x" width={800} height={600} loading="lazy" />;`;

  // Act / Assert
  assert.deepEqual(findUnreservedImages(source, "a.tsx"), []);
});

test("reports an image with no intrinsic size", () => {
  // Arrange — the shape both of this app's images had: a fluid box that is zero tall until
  // the bytes land, so everything under it jumps.
  const source = `export const A = () => <img src={src} alt="x" className="max-h-80 w-full" loading="lazy" />;`;

  // Act
  const violations = findUnreservedImages(source, "a.tsx");

  // Assert
  assert.deepEqual(violations.map(({ attribute }) => attribute), ["width", "height"]);
  assert.match(formatImageViolations(violations), /a\.tsx:1 — <img>.*width.*pulse\/illustration/);
});

test("reports an image that never says whether it is worth fetching yet", () => {
  // Arrange
  const source = `export const A = () => <img src={src} alt="x" width={800} height={600} />;`;

  // Act / Assert — `eager` is an answer too; the guard asks for the decision, not a value.
  assert.deepEqual(findUnreservedImages(source, "a.tsx").map(({ attribute }) => attribute),
    ["loading"]);
  assert.deepEqual(
    findUnreservedImages(`export const A = () => <img src={s} width={1} height={1} loading="eager" />;`, "a.tsx"),
    [],
  );
});

test("a spread of unknown props does not count as reserving anything", () => {
  // Arrange — `{...props}` may or may not carry them, so it answers no question.
  const source = `export const A = (props) => <img {...props} />;`;

  // Act / Assert
  assert.deepEqual(findUnreservedImages(source, "a.tsx").map(({ attribute }) => attribute),
    ["width", "height", "loading"]);
});

test("ignores a component whose name merely contains img", () => {
  // Arrange — only the lowercase element is the raw image.
  const source = `export const A = () => <div><Image src={s} /><ImgBox /></div>;`;

  // Act / Assert
  assert.deepEqual(findUnreservedImages(source, "a.tsx"), []);
});

test("no component renders an image that does not reserve its box", () => {
  // Arrange
  const files = componentSources();

  // Act
  const violations = files.flatMap((file) =>
    findUnreservedImages(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert
  assert.equal(violations.length, 0, `\n${formatImageViolations(violations)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("every image exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert: the registry ships empty; an entry must justify itself.
  for (const exemption of IMAGE_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file}: ${exemption.attribute} has no reason`);
    assert.ok(componentSources().includes(exemption.file), `${exemption.file} is not a component source`);
  }
});
