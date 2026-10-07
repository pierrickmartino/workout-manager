import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "@typescript/typescript6";

import { loadTsx } from "./tsx-harness.ts";

// ADR-0109 (composition audit #5): the launchpad used to gate its two no-AI cards with
// `showBuild` and `showLogPastWorkout` — two booleans describing four states, of which two
// were ever used. The cards are now composed as children, so a call site writes the cards it
// offers instead of answering "which combination is this?".
//
// What these hold is what the booleans used to decide: the two generation links are the
// launchpad's own and are always there, a composed card lands *after* them in the one stack
// that spaces them, and each card names one destination.

const MODULE = "components/pulse/generate-training-launchpad.tsx";
const webRoot = resolve(import.meta.dirname, "..");

function render(element: React.ReactElement): Document {
  return new JSDOM(renderToStaticMarkup(element)).window.document;
}

function links(document: Document): readonly { href: string; label: string }[] {
  return [...document.querySelectorAll("a")].map((anchor) => ({
    href: anchor.getAttribute("href")!,
    label: anchor.textContent!.trim(),
  }));
}

test("the launchpad on its own offers only the two generation routes", () => {
  // Arrange — the Home empty state's shape: AI-only, because Home's quick-action row already
  // carries Build and Log (ADR-0071).
  const { GenerateTrainingLaunchpad } = loadTsx(MODULE);

  // Act
  const document = render(
    React.createElement(GenerateTrainingLaunchpad, {
      eyebrow: "GET STARTED // NO ACTIVE PROTOCOL",
      from: "/dashboard",
    }),
  );

  // Assert — and the standalone-workout link carries the caller's route as `?from=`, so that
  // screen's back control returns to Home rather than defaulting to it.
  assert.deepEqual(links(document), [
    { href: "/protocols/new", label: "Generate a protocol" },
    { href: "/sessions/new?from=%2Fdashboard", label: "Generate a workout" },
  ]);
});

test("a composed card follows the generation routes in the same stack", () => {
  // Arrange — the TRAIN launchpad's shape, which is what the two booleans used to select.
  const { GenerateTrainingLaunchpad, BuildWorkoutLink, LogPastWorkoutLink } = loadTsx(MODULE);

  // Act
  const document = render(
    React.createElement(
      GenerateTrainingLaunchpad,
      { eyebrow: "TRAIN // START SOMETHING NEW", from: "/train" },
      React.createElement(BuildWorkoutLink),
      React.createElement(LogPastWorkoutLink),
    ),
  );

  // Assert — order first: a composed card is an addition to the generation routes, never
  // ahead of them.
  assert.deepEqual(links(document), [
    { href: "/protocols/new", label: "Generate a protocol" },
    { href: "/sessions/new?from=%2Ftrain", label: "Generate a workout" },
    { href: "/sessions/build", label: "Build a workout" },
    { href: "/sessions/log", label: "Log a past workout" },
  ]);

  // And the composed cards are siblings of the generation links, not a nested box: the stack
  // is what spaces all four evenly, so a wrapper would show as a double gap.
  const stack = document.querySelector("a")!.parentElement!;
  assert.equal(stack.children.length, 4);
  assert.deepEqual(
    [...stack.children].map((child) => child.tagName),
    ["A", "A", "A", "A"],
  );

  // A composed card is styled identically to the generation link above it — that is what
  // `LAUNCH_LINK` is for, and a card that drifted from its neighbours would read as a
  // different kind of thing. The primary protocol CTA is deliberately the one that differs.
  const [protocol, ...secondary] = [...stack.children].map((child) => child.className);
  assert.equal(new Set(secondary).size, 1, `three identical chips, saw ${secondary.join(" | ")}`);
  assert.match(secondary[0], /\bw-full\b/);
  assert.match(secondary[0], /\bbg-surface\b/);
  assert.notEqual(protocol, secondary[0]);

  // Each card carries its icon, which is the other half of looking like its neighbours.
  for (const child of stack.children) assert.ok(child.querySelector("svg"), child.textContent!);
});

test("each composable card names one destination and says what it does", () => {
  // Arrange — the two cards are no-AI entry points: author a reusable plan to run later
  // (intent I4), or record a workout already done (ADR-0040).
  const { BuildWorkoutLink, LogPastWorkoutLink } = loadTsx(MODULE);

  // Act
  const build = links(render(React.createElement(BuildWorkoutLink)));
  const log = links(render(React.createElement(LogPastWorkoutLink)));

  // Assert
  assert.deepEqual(build, [{ href: "/sessions/build", label: "Build a workout" }]);
  assert.deepEqual(log, [{ href: "/sessions/log", label: "Log a past workout" }]);
});

test("the launchpad declares no flag that selects between compositions", () => {
  // Arrange — the finding itself: each gating boolean doubles a state space whose corners
  // nobody renders. Read from the props interface rather than from the rendering, because a
  // flag added and not yet passed is the regression, and it renders as nothing at all.
  const source = readFileSync(resolve(webRoot, MODULE), "utf8");
  const tree = ts.createSourceFile(MODULE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  // Act
  const booleans: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertySignature(node) && node.type) {
      const kinds = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type];
      if (kinds.some((kind) => kind.kind === ts.SyntaxKind.BooleanKeyword))
        booleans.push(node.name.getText(tree));
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);

  // Assert
  assert.deepEqual(booleans, []);
});
