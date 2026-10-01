import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findNativeDialogCalls,
  formatNativeDialogCalls,
} from "./native-dialog-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

test("reports a window.confirm guarding a destructive action", () => {
  // Arrange
  const source = `export const A = () => <button onClick={() => { if (window.confirm("Sure?")) go(); }} />;`;

  // Act
  const calls = findNativeDialogCalls(source, "a.tsx");

  // Assert
  assert.deepEqual(calls, [{ file: "a.tsx", line: 1, dialog: "confirm" }]);
  assert.match(formatNativeDialogCalls(calls), /a\.tsx:1 — window\.confirm.*confirm-dialog/);
});

test("reports a bare confirm, alert or prompt too", () => {
  // Arrange — `window.` is optional; the browser dialog is the same one either way.
  const source = `const a = () => { confirm("x"); alert("y"); prompt("z"); };`;

  // Act / Assert
  assert.deepEqual(
    findNativeDialogCalls(source, "a.tsx").map(({ dialog }) => dialog),
    ["confirm", "alert", "prompt"],
  );
});

test("a comment or a string about window.confirm is not a call", () => {
  // Arrange — read from the AST, so the components that explain why they do not use it do
  // not trip the rule they are documenting.
  const source = `// window.confirm ignores the Skin.\nexport const note = "window.confirm";`;

  // Act / Assert
  assert.deepEqual(findNativeDialogCalls(source, "a.tsx"), []);
});

test("a method named confirm on something else is left alone", () => {
  // Arrange — only the browser's own dialogs are the subject.
  const source = `const a = () => { wizard.confirm(step); dialogState.alert = true; };`;

  // Act / Assert
  assert.deepEqual(findNativeDialogCalls(source, "a.tsx"), []);
});

test("no component asks a question in browser chrome", () => {
  // Arrange
  const files = componentSources();

  // Act
  const calls = files.flatMap((file) =>
    findNativeDialogCalls(readFileSync(resolve(webRoot, file), "utf8"), file));

  // Assert — a browser dialog ignores the Skin, traps no focus of ours, and can be switched
  // off for the rest of the page, which turns a guard into a standing answer (#8).
  assert.equal(calls.length, 0, `\n${formatNativeDialogCalls(calls)}\n`);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});
