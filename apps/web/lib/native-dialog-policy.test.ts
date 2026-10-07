import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  findNativeDialogCalls,
  formatNativeDialogCalls,
} from "./native-dialog-policy.ts";
import { sweptWebSources, sweptWebSourcePath } from "./swept-web-sources.ts";

// Swept over the whole web root, not just `components/` and `app/`: a `confirm()` asks the
// browser the question wherever it is written, and the obvious next place to write one is a
// `lib/use-*.ts` hook. This follows `icon-import-policy.ts` rather than the chart guards,
// which carve out `audit/` for a reason that has no analogue here. The walk itself, and the
// assertions on its reach, are `swept-web-sources.test.ts`'s — this guard was one of the
// three copies.

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

test("nothing in the app asks a question in browser chrome", () => {
  // Arrange
  const files = sweptWebSources();

  // Act
  const calls = files.flatMap((file) =>
    findNativeDialogCalls(readFileSync(sweptWebSourcePath(file), "utf8"), file));

  // Assert — a browser dialog ignores the Skin, traps no focus of ours, and can be switched
  // off for the rest of the page, which turns a guard into a standing answer (#8).
  assert.equal(calls.length, 0, `\n${formatNativeDialogCalls(calls)}\n`);
});
