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

test("an admin route lights the nested admin entry and not PROFILE", () => {
  // Arrange — /admin is owned by the PROFILE tab in tab-nav.ts, so without the precedence
  // rule both would light at once.
  // Act
  const entries = sidebarEntries("/admin/exercises/1", true);
  // Assert
  const active = entries.filter((entry) => entry.active).map((entry) => entry.label);
  assert.deepEqual(active, []);
  const lit = entries
    .flatMap((entry) => entry.children ?? [])
    .filter((child) => child.active)
    .map((child) => child.label);
  assert.deepEqual(lit, ["Exercise catalog"]);
});

test("a profile route lights PROFILE even for an admin", () => {
  const entries = sidebarEntries("/profile/edit", true);
  const active = entries.filter((entry) => entry.active).map((entry) => entry.label);
  assert.deepEqual(active, ["PROFILE"]);
});

test("never lights more than one entry, on any declared route", () => {
  // Every prefix the registry declares, plus the admin subtree, in both roles.
  const paths = [
    ...TABS.flatMap((tab) => tab.match),
    "/admin",
    "/admin/exercises",
    "/admin/exercises/1",
    "/admin/ai-audit-log",
    "/admin/ai-audit-log/1",
  ];
  for (const isAdmin of [false, true]) {
    for (const path of paths) {
      const active = litLabels(path, isAdmin);
      assert.ok(active.length <= 1, `${path} (admin=${isAdmin}) lights ${active.length} entries`);
    }
  }
});

test("a tab-less route lights nothing", () => {
  const entries = sidebarEntries("/onboarding", true);
  assert.equal(entries.filter((entry) => entry.active).length, 0);
});

// Nested admin entries (#770): inside the admin area, the admin entry expands into the three
// admin areas so an admin moves between them without going back through the admin home.

function adminChildren(pathname: string, isAdmin: boolean) {
  const admin = sidebarEntries(pathname, isAdmin).find(
    (entry) => entry.label === ADMIN_ENTRY_LABEL,
  );
  return admin?.children ?? [];
}

test("inside the admin area, an admin sees Overview, Exercise catalog and AI audit log nested", () => {
  // Act
  const children = adminChildren("/admin", true);
  // Assert
  assert.deepEqual(
    children.map((child) => [child.label, child.href]),
    [
      ["Overview", "/admin"],
      ["Exercise catalog", "/admin/exercises"],
      ["AI audit log", "/admin/ai-audit-log"],
    ],
  );
});

test("outside the admin area, the admin entry carries no nested entries", () => {
  assert.deepEqual(adminChildren("/dashboard", true), []);
  assert.deepEqual(adminChildren("/administrator", true), []);
});

test("a non-admin inside the admin area sees no admin entry and no nested entries", () => {
  // Arrange — the frontend 404s a non-admin here (ADR-0046); the sidebar must not leak anyway.
  // Act
  const entries = sidebarEntries("/admin/exercises", false);
  // Assert
  assert.deepEqual(
    entries.map((entry) => entry.label),
    TABS.map((tab) => tab.label),
  );
  assert.ok(entries.every((entry) => entry.children === undefined));
});

// Every "you are here" marker in the sidebar, nested ones included.
function litLabels(pathname: string, isAdmin: boolean): readonly string[] {
  return sidebarEntries(pathname, isAdmin).flatMap((entry) => [
    ...(entry.active ? [entry.label] : []),
    ...(entry.children ?? []).filter((child) => child.active).map((child) => child.label),
  ]);
}

test("the most specific admin entry, alone, is lit on each admin route", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["/admin", "Overview"],
    ["/admin/exercises", "Exercise catalog"],
    ["/admin/exercises/42", "Exercise catalog"],
    ["/admin/ai-audit-log", "AI audit log"],
    ["/admin/ai-audit-log/7", "AI audit log"],
  ];
  for (const [pathname, expected] of cases) {
    assert.deepEqual(litLabels(pathname, true), [expected], pathname);
  }
});
