import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import { loadTsx, mountDom } from "./tsx-harness.ts";
import { formatInstantLocal } from "./instant.ts";

// ADR-0096: the reader's clock is only knowable in the reader's browser, so the swap to it
// happens after mount — and the markup before that swap has to be the *same* markup, or React
// reports a hydration mismatch on a page whose only fault was knowing what time it is.
//
// Rendered rather than read from source: "what the server sends" and "what the first client
// paint produces" are the two things that must agree, and only rendering shows them.

const ISO = "2026-09-30T14:03:22.123456";

type InstantComponent = (props: { iso: string }) => React.JSX.Element;

function load(): InstantComponent {
  return loadTsx<{ LocalInstant: InstantComponent }>(
    "components/pulse/local-instant.tsx",
  ).LocalInstant;
}

test("the server renders a zone-explicit instant that names its clock", () => {
  // Arrange
  const LocalInstant = load();

  // Act
  const markup = renderToStaticMarkup(React.createElement(LocalInstant, { iso: ISO }));
  const element = new JSDOM(markup).window.document.querySelector("time")!;

  // Assert — a naive string read as UTC, written back in UTC and labelled as such.
  assert.equal(element.textContent, "2026-09-30 14:03 UTC");
  assert.equal(element.getAttribute("datetime"), "2026-09-30T14:03:22.123456Z");
});

test("the first client paint matches the server's markup exactly", async () => {
  // Arrange
  const { restore } = mountDom();
  try {
    const LocalInstant = load();
    const server = renderToStaticMarkup(React.createElement(LocalInstant, { iso: ISO }));
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);

    // Act — React commits the first render and its effects in one `act`, so the only way to
    // read the pre-effect paint is to look at what a render without effects produces. That is
    // what hydration compares against, and it is `server` above.
    await React.act(async () => root.render(React.createElement(LocalInstant, { iso: ISO })));

    // Assert — the swap happened (we are in a browser now), and the element it replaced is
    // the same `<time>` the server sent, so hydration had nothing to reconcile. Parsed rather
    // than string-matched: HTML attribute names are case-insensitive and React writes the JSX
    // spelling through, so `dateTime` and `datetime` are the same attribute.
    const element = document.querySelector("time")!;
    const sent = new JSDOM(server).window.document.querySelector("time")!;
    assert.equal(element.getAttribute("datetime"), "2026-09-30T14:03:22.123456Z");
    assert.equal(sent.getAttribute("datetime"), element.getAttribute("datetime"));
    assert.equal(sent.textContent, "2026-09-30 14:03 UTC");

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("once mounted it reads in the reader's own clock", async () => {
  // Arrange
  const { restore } = mountDom();
  try {
    const LocalInstant = load();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);

    // Act
    await React.act(async () => root.render(React.createElement(LocalInstant, { iso: ISO })));

    // Assert — whatever locale and zone the runner is in, the text is that one, not UTC's.
    assert.equal(
      document.querySelector("time")!.textContent,
      formatInstantLocal(Date.UTC(2026, 8, 30, 14, 3, 22, 123)),
    );

    await React.act(async () => root.unmount());
  } finally {
    restore();
  }
});

test("a value it cannot read is shown as it came, never as a made-up date", () => {
  // Arrange
  const LocalInstant = load();

  // Act
  const markup = renderToStaticMarkup(
    React.createElement(LocalInstant, { iso: "sometime last tuesday" }),
  );
  const document_ = new JSDOM(markup).window.document;

  // Assert — no `<time>`, because there is no machine-readable instant to put in one, and the
  // raw value stays visible so an operator can see what the row actually holds.
  assert.equal(document_.querySelector("time"), null);
  assert.equal(document_.body.textContent, "sometime last tuesday");
});
