import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveGuardedNavigation,
  type NavigationClickInfo,
} from "./navigation-guard.ts";

const ORIGIN = "https://app.example.com";

// A left-click on an in-app link with no modifier keys — the one case the guard
// should intercept. Overrides let each test bend a single field away from this.
function click(overrides: Partial<NavigationClickInfo> = {}): NavigationClickInfo {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    anchor: {
      href: `${ORIGIN}/train`,
      target: null,
      download: false,
      origin: ORIGIN,
    },
    currentOrigin: ORIGIN,
    currentUrl: `${ORIGIN}/sessions/log`,
    ...overrides,
  };
}

test("intercepts a plain left-click on a same-origin in-app link", () => {
  // Arrange
  const info = click();

  // Act
  const destination = resolveGuardedNavigation(info);

  // Assert
  assert.equal(destination, "/train");
});

test("preserves the destination's query and hash", () => {
  const info = click({
    anchor: {
      href: `${ORIGIN}/history?page=2#top`,
      target: null,
      download: false,
      origin: ORIGIN,
    },
  });

  assert.equal(resolveGuardedNavigation(info), "/history?page=2#top");
});

test("ignores a click whose default was already prevented", () => {
  assert.equal(resolveGuardedNavigation(click({ defaultPrevented: true })), null);
});

test("ignores non-primary mouse buttons", () => {
  assert.equal(resolveGuardedNavigation(click({ button: 1 })), null);
});

test("ignores modifier-key clicks that open a new tab or window", () => {
  assert.equal(resolveGuardedNavigation(click({ metaKey: true })), null);
  assert.equal(resolveGuardedNavigation(click({ ctrlKey: true })), null);
  assert.equal(resolveGuardedNavigation(click({ shiftKey: true })), null);
  assert.equal(resolveGuardedNavigation(click({ altKey: true })), null);
});

test("ignores a click that did not land on an anchor", () => {
  assert.equal(resolveGuardedNavigation(click({ anchor: null })), null);
});

test("ignores a link that targets a new browsing context", () => {
  const info = click({
    anchor: {
      href: `${ORIGIN}/train`,
      target: "_blank",
      download: false,
      origin: ORIGIN,
    },
  });

  assert.equal(resolveGuardedNavigation(info), null);
});

test("allows an explicit _self target through the guard", () => {
  const info = click({
    anchor: {
      href: `${ORIGIN}/train`,
      target: "_self",
      download: false,
      origin: ORIGIN,
    },
  });

  assert.equal(resolveGuardedNavigation(info), "/train");
});

test("ignores a download link", () => {
  const info = click({
    anchor: {
      href: `${ORIGIN}/export.csv`,
      target: null,
      download: true,
      origin: ORIGIN,
    },
  });

  assert.equal(resolveGuardedNavigation(info), null);
});

test("ignores a link to a different origin", () => {
  const info = click({
    anchor: {
      href: "https://other.example.com/train",
      target: null,
      download: false,
      origin: "https://other.example.com",
    },
  });

  assert.equal(resolveGuardedNavigation(info), null);
});

test("ignores a same-page hash link (no route change)", () => {
  const info = click({
    anchor: {
      href: `${ORIGIN}/sessions/log#exercises`,
      target: null,
      download: false,
      origin: ORIGIN,
    },
    currentUrl: `${ORIGIN}/sessions/log`,
  });

  assert.equal(resolveGuardedNavigation(info), null);
});

test("ignores a click that navigates to the exact current URL", () => {
  const info = click({
    anchor: {
      href: `${ORIGIN}/sessions/log`,
      target: null,
      download: false,
      origin: ORIGIN,
    },
    currentUrl: `${ORIGIN}/sessions/log`,
  });

  assert.equal(resolveGuardedNavigation(info), null);
});

test("intercepts when only the query differs from the current URL", () => {
  const info = click({
    anchor: {
      href: `${ORIGIN}/sessions/log?tab=plan`,
      target: null,
      download: false,
      origin: ORIGIN,
    },
    currentUrl: `${ORIGIN}/sessions/log`,
  });

  assert.equal(resolveGuardedNavigation(info), "/sessions/log?tab=plan");
});
