import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { loadTsx, mountDom } from "./tsx-harness.ts";

// The set-aside note (#640, ADR-0125) must be *announced* politely. A live region that arrives
// already holding its text is usually not read out — assistive tech announces changes to a
// region it already knows — so the region ships empty from the server and the text lands after
// mount, the shape `SyncStatusBanner` keeps for the same reason (ADR-0124).

type NoteModule = { SetAsideNote: (props: { label: string }) => React.JSX.Element };

function loadNote(): NoteModule {
  return loadTsx<NoteModule>("components/SetAsideNote.tsx", {
    "next/link": {
      __esModule: true,
      default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
        React.createElement("a", { href, ...rest }, children),
    },
  });
}

test("the set-aside note's status region is served empty", async () => {
  // Arrange
  const { SetAsideNote } = loadNote();
  const { renderToString } = await import("react-dom/server");
  // Act
  const html = renderToString(React.createElement(SetAsideNote, { label: "Summer Strength" }));
  // Assert: the polite region exists, but its message has not arrived yet.
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /Summer Strength/);
});

test("once mounted, the note names the set-aside Protocol and links to Protocols without taking focus", async () => {
  // Arrange
  const { restore } = mountDom({ url: "http://localhost/protocols/12?set_aside=4" });
  try {
    const { SetAsideNote } = loadNote();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    // Act
    await React.act(async () =>
      root.render(React.createElement(SetAsideNote, { label: "Summer Strength" })),
    );
    // Assert
    const region = document.querySelector<HTMLElement>('[role="status"]');
    assert.ok(region, "no status region");
    assert.match(region.textContent ?? "", /Summer Strength/);
    assert.match(region.textContent ?? "", /set aside/);
    assert.equal(region.querySelector("a")?.getAttribute("href"), "/protocols");
    assert.equal(document.activeElement, document.body);
    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});
