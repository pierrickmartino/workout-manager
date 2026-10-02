import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";

import { loadTsx as importComponent } from "./tsx-harness.ts";

// ADR-0094: the app's section divider is the outline. `SectionHeader` is the only divider
// in use, so what it emits decides whether screen-reader heading navigation finds anything
// below the page's single `<h1>`.

const webRoot = resolve(import.meta.dirname, "..");

function render(element: React.ReactElement): Document {
  return new JSDOM(renderToStaticMarkup(element)).window.document;
}

test("a section divider is a second-level heading carrying the section's name", () => {
  // Arrange
  const { SectionHeader } = importComponent("components/pulse/section-header.tsx");

  // Act
  const document = render(React.createElement(SectionHeader, { meta: "04/05" }, "WEEK CYCLE"));

  // Assert — the name is the label alone: the ▸ marker is decoration and the counter is
  // a sibling, so neither lands in the heading a reader hears.
  const heading = document.querySelector("h2")!;
  assert.equal(heading.textContent, "▸ WEEK CYCLE");
  assert.equal(heading.querySelector("[aria-hidden]")!.textContent, "▸ ");
  assert.equal(document.querySelectorAll("h1, h3, h4, h5, h6").length, 0);
  assert.match(document.body.textContent!, /04\/05/);
});

test("a divider nested under another section takes the next level down", () => {
  // Arrange
  const { SectionHeader } = importComponent("components/pulse/section-header.tsx");

  // Act
  const document = render(React.createElement(SectionHeader, { level: 3 }, "TOP-SET TREND"));

  // Assert — a level is offered so a nested divider does not claim a sibling's rank; no
  // level skips either way, since the only two ranks are 2 and 3.
  assert.equal(document.querySelector("h3")!.textContent, "▸ TOP-SET TREND");
  assert.equal(document.querySelector("h2"), null);
});

test("becoming a heading leaves the divider's rendered appearance untouched", () => {
  // Arrange
  const { SectionHeader } = importComponent("components/pulse/section-header.tsx");

  // Act
  const document = render(React.createElement(SectionHeader, { className: "flex-1" }, "MUSCLES"));

  // Assert — the label keeps the mono treatment, the rule and the row layout, so the
  // outline is additive rather than a restyle. Tailwind's preflight drops the browser's
  // own heading size, weight and margins.
  const row = document.body.firstElementChild!;
  assert.match(row.className, /flex items-center gap-3 flex-1/);
  assert.match(document.querySelector("h2")!.className, /label-mono .*text-\[11px\] font-semibold .*text-cyan/);
  assert.ok(row.querySelector(".bg-border"), "the rule that fills the remaining width");
});

test("a session card's title is the same rank as the history row it mirrors", () => {
  // Arrange — the card is the list item of My Sessions and of Train's "pick up again"
  // panel; neither list sits under a divider, so an <h3> there skipped a level straight
  // from the page's <h1>. `HistoryBrowser` already titles the same role with an <h2>.
  const { SessionCard } = importComponent("components/SessionCard.tsx");
  const { recentSessionCardModel } = importComponent("lib/session-card.ts");
  const model = recentSessionCardModel({
    id: 7, displayName: "Upper Push", trainingType: "strength", lastPerformedOn: "2026-09-14",
    previewExercises: ["Bench Press"], exerciseCount: 5, startHref: "/sessions/7/live",
  });

  // Act
  const document = render(React.createElement(SessionCard, { model }));

  // Assert
  assert.equal(document.querySelector("h2")!.textContent, "Upper Push");
  assert.equal(document.querySelector("h3"), null);
});

test("a group label that introduces content is a heading, and its cards sit under it", () => {
  // Arrange — Train labels its groups with a `TRAIN // …` eyebrow rather than the ▸ rule.
  // It is still a section label, so leaving it a <span> while the cards under it became
  // <h2> would put the items in the outline and not the group that holds them.
  const { RecentSessions } = importComponent("components/RecentSessions.tsx");
  const rows = [{
    id: 7, displayName: "Upper Push", trainingType: "strength", lastPerformedOn: "2026-09-14",
    previewExercises: ["Bench Press"], exerciseCount: 5, startHref: "/sessions/7/live",
  }];

  // Act
  const document = render(React.createElement(RecentSessions, { rows }));

  // Assert
  assert.equal(document.querySelector("h2")!.textContent!.trim(), "TRAIN // PICK UP AGAIN");
  assert.equal(document.querySelector("h3")!.textContent, "Upper Push");
});

test("the Train group labels are headings", () => {
  // Arrange — the two remaining `TRAIN // …` labels hold no card, so a sweep of the source
  // is the honest check: the page is a Server Component with its own data reads.
  const page = readFileSync(resolve(webRoot, "app/train/page.tsx"), "utf8");

  // Act
  const spans = page.match(/<span[^>]*>\s*TRAIN \/\//g) ?? [];

  // Assert
  assert.deepEqual(spans, []);
  assert.equal((page.match(/TRAIN \/\//g) ?? []).length, 3, "the eyebrow plus two group labels");
});

// The marker as *rendered*, not as written: it is read out of JSX text and string literals, so
// a comment or a doc-string that names the character is not a divider. Reading bytes instead
// made this file's own explanation of the rule fail it.
function rendersSectionMarker(source: string, file: string): boolean {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = false;
  const visit = (node: ts.Node): void => {
    const isText = ts.isJsxText(node) || ts.isStringLiteral(node)
      || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
    if (isText && node.text.includes("▸")) found = true;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return found;
}

test("no component hand-rolls a section divider instead of using the heading", () => {
  // Arrange — the outline only holds if every divider comes from the one component.
  const divider = "components/pulse/section-header.tsx";
  const files = ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
  const marker = (file: string): boolean =>
    rendersSectionMarker(readFileSync(resolve(webRoot, file), "utf8"), file);

  // Act — the divider's signature is the ▸ marker the component prepends.
  const offenders = files.filter((file) => file !== divider && marker(file));

  // Assert
  assert.deepEqual(offenders, []);
  assert.ok(marker(divider), "the sweep must find the marker where it legitimately lives");
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});
