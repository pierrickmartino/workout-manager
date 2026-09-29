import { test } from "node:test";
import assert from "node:assert/strict";

import { TABS } from "./tab-nav.ts";
import { sidebarEntries, ADMIN_ENTRY_LABEL } from "./sidebar-nav.ts";

// The sidebar and the TabBar are the same navigation at two widths (ADR-0088), so the
// load-bearing assertion is that the sidebar cannot silently drop a route family the registry
// declares — and that the admin entry, which exists only here, cannot leak to a non-admin.

test("renders every tab the registry declares, in registry order", () => {
  // Arrange
  const expected = TABS.map((tab) => tab.label);
  // Act
  const labels = sidebarEntries("/dashboard", false).map((entry) => entry.label);
  // Assert
  assert.deepEqual(labels, expected);
});

test("omits the admin entry for a non-admin", () => {
  const labels = sidebarEntries("/dashboard", false).map((entry) => entry.label);
  assert.ok(!labels.includes(ADMIN_ENTRY_LABEL));
});

test("adds the admin entry, last, for an admin", () => {
  const labels = sidebarEntries("/dashboard", true).map((entry) => entry.label);
  assert.equal(labels.at(-1), ADMIN_ENTRY_LABEL);
  assert.equal(labels.length, TABS.length + 1);
});

test("an admin route lights ADMIN and not PROFILE", () => {
  // Arrange — /admin is owned by the PROFILE tab in tab-nav.ts, so without the precedence
  // rule both would light at once.
  // Act
  const entries = sidebarEntries("/admin/exercises/1", true);
  // Assert
  const active = entries.filter((entry) => entry.active).map((entry) => entry.label);
  assert.deepEqual(active, [ADMIN_ENTRY_LABEL]);
});

test("a profile route lights PROFILE even for an admin", () => {
  const entries = sidebarEntries("/profile/edit", true);
  const active = entries.filter((entry) => entry.active).map((entry) => entry.label);
  assert.deepEqual(active, ["PROFILE"]);
});

test("never lights more than one entry, on any declared route", () => {
  // Every prefix the registry declares, plus the admin subtree, in both roles.
  const paths = [...TABS.flatMap((tab) => tab.match), "/admin", "/admin/exercises"];
  for (const isAdmin of [false, true]) {
    for (const path of paths) {
      const active = sidebarEntries(path, isAdmin).filter((entry) => entry.active);
      assert.ok(active.length <= 1, `${path} (admin=${isAdmin}) lights ${active.length} entries`);
    }
  }
});

test("a tab-less route lights nothing", () => {
  const entries = sidebarEntries("/onboarding", true);
  assert.equal(entries.filter((entry) => entry.active).length, 0);
});
