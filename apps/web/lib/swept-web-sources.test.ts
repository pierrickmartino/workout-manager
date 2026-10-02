import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  UNSWEPT_DIRECTORIES,
  WEB_SOURCE_EXTENSIONS,
  sweptWebSources,
  sweptWebSourcePath,
} from "./swept-web-sources.ts";

// The claim the three static guards used to make one copy each: the sweep reaches the web
// root. A guard that matched nothing reports a clean sweep, which is the one failure mode a
// zero-findings assertion cannot tell apart from compliance.
test("the sweep reaches the whole web root rather than silently matching nothing", () => {
  // Arrange / Act
  const files = sweptWebSources();

  // Assert
  assert.ok(files.length > 100, `expected the sweep to cover the web root, saw ${files.length} files`);
  // `scripts/` and `audit/` were once outside it, which made "fails closed" an overclaim
  // (ADR-0092); they are named here so that cannot happen quietly again.
  for (const directory of ["components", "app", "lib", "scripts", "audit"]) {
    assert.ok(
      files.some((file) => file.startsWith(`${directory}/`)),
      `${directory}/ must be swept`,
    );
  }
  assert.ok(files.includes("proxy.ts"), "a module at the web root must be swept");
  // Nested, not just the top level: a component three folders down is where a rule is broken.
  assert.ok(
    files.some((file) => file.split("/").length > 2),
    "the walk must be recursive",
  );
});

test("installed packages, build output and served files are not source", () => {
  // Arrange / Act
  const files = sweptWebSources();

  // Assert
  for (const directory of UNSWEPT_DIRECTORIES) {
    assert.ok(
      !files.some((file) => file.split("/").includes(directory)),
      `${directory} must not be swept`,
    );
  }
  assert.ok(
    files.every((file) => WEB_SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension))),
    "only source extensions are swept",
  );
  // Forward slashes, so a reported finding reads the same wherever the suite runs.
  assert.ok(!files.some((file) => file.includes("\\")), "paths are reported with /");
});

test("a swept entry resolves to a file a guard can read", () => {
  // Arrange — the guards pair the relative entry (what they report) with the absolute path
  // (what they read), so the two must be the same file.
  const entry = sweptWebSources().find((file) => file === "lib/swept-web-sources.ts");

  // Act
  const source = readFileSync(sweptWebSourcePath(entry!), "utf8");

  // Assert
  assert.match(source, /export function sweptWebSources/);
});
