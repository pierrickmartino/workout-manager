import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { TABS, TAB_LESS_ROUTES, isActive, activeTab } from "./tab-nav.ts";

// The TabBar is mounted globally for every signed-in route (app/layout.tsx), so a route
// with no owning tab renders a dead nav bar — nothing lit, no "you are here" (finding #10).
// These tests pin the two journeys that used to lose orientation, and — the load-bearing
// part — walk the route tree so a *new* top-level route family cannot silently join them.

test("the ad-hoc log flow (/logs) is oriented under STATS", () => {
  // Arrange — reached only from History, which lives under STATS.
  // Act
  const tab = activeTab("/logs/new");
  // Assert
  assert.equal(tab?.label, "STATS");
});

test("the admin area (/admin) is oriented under PROFILE", () => {
  // Arrange — reached by the admin-only nav row on Profile (ADR-0071).
  // Act
  const tab = activeTab("/admin/exercises/1");
  // Assert
  assert.equal(tab?.label, "PROFILE");
});

test("a deliberately tab-less route (/onboarding) lights no tab", () => {
  assert.equal(activeTab("/onboarding"), null);
});

test("existing families still light their expected tab", () => {
  assert.equal(activeTab("/dashboard")?.label, "HOME");
  assert.equal(activeTab("/sessions/1/live")?.label, "TRAIN");
  assert.equal(activeTab("/history")?.label, "STATS");
  assert.equal(activeTab("/profile/edit")?.label, "PROFILE");
});

test("no route is claimed by more than one tab", () => {
  // A match-prefix collision would make `activeTab` throw; probe every declared prefix.
  for (const tab of TABS) {
    for (const prefix of tab.match) {
      assert.doesNotThrow(() => activeTab(prefix), `${prefix} has a tab collision`);
    }
  }
});

test("a path sharing only a string prefix is not matched", () => {
  // `/logspace` starts with the string "/logs" but is a different family; the
  // slash-boundary check must not light STATS for it.
  const stats = TABS.find((tab) => tab.label === "STATS");
  assert.ok(stats);
  assert.equal(isActive("/logspace", stats), false);
});

// --- Coverage guard: every navigable top-level route family declares its orientation ---

const APP_DIR = join(import.meta.dirname, "..", "app");

// A top-level segment is "navigable" when its subtree contains a page (as opposed to
// `api`/`actions`, which hold route handlers and server actions, not pages). Route groups,
// private folders, dynamic segments, and dotfiles are not real top-level path segments.
function isRouteSegment(name: string): boolean {
  return !/^[([._]/.test(name);
}

function subtreeHasPage(dir: string): boolean {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(entry.name)) return true;
    if (entry.isDirectory() && subtreeHasPage(join(dir, entry.name))) return true;
  }
  return false;
}

function navigableTopLevelSegments(): string[] {
  return readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isRouteSegment(entry.name))
    .filter((entry) => subtreeHasPage(join(APP_DIR, entry.name)))
    .map((entry) => `/${entry.name}`);
}

test("every navigable top-level route is owned by exactly one tab or explicitly tab-less", () => {
  assert.ok(existsSync(APP_DIR), `app dir not found at ${APP_DIR}`);
  const allowlist = new Set(TAB_LESS_ROUTES);

  for (const segment of navigableTopLevelSegments()) {
    const owners = TABS.filter((tab) => isActive(segment, tab));
    const allowlisted = allowlist.has(segment);

    // Exactly one of: owned by a single tab, or deliberately tab-less. Never both, never
    // neither. "Neither" is the silent-orientation-loss this test exists to prevent — add
    // the new family to a tab's `match` in tab-nav.ts, or to TAB_LESS_ROUTES on purpose.
    if (allowlisted) {
      assert.equal(
        owners.length,
        0,
        `${segment} is both tab-less and owned by ${owners.map((t) => t.label).join(", ")}`,
      );
    } else {
      assert.equal(
        owners.length,
        1,
        `${segment} has no tab orientation — add it to a tab's match[] or to TAB_LESS_ROUTES`,
      );
    }
  }
});

test("no TAB_LESS_ROUTES entry is also owned by a tab", () => {
  for (const route of TAB_LESS_ROUTES) {
    const owners = TABS.filter((tab) => isActive(route, tab));
    assert.equal(owners.length, 0, `${route} is allowlisted yet owned by a tab`);
  }
});
