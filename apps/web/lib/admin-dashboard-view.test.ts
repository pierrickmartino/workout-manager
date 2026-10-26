import { test } from "node:test";
import assert from "node:assert/strict";

import { adminDashboardView } from "./admin-dashboard-view.ts";
import { parseAdminFilters } from "./admin-exercises-view.ts";

const BREAKDOWN = { stub: 4, listable: 6, enriched: 10, total: 20 };

function row(id: number, retired: boolean) {
  return { id, name: `Exercise ${id}`, provenance: "curated", completeness: "enriched", retired };
}

const ROWS = [row(1, false), row(2, true), row(3, true), row(4, false)];

function catalogGroup(view: ReturnType<typeof adminDashboardView>) {
  const group = view.groups.find((g) => g.key === "catalog");
  assert.ok(group, "the dashboard always carries a catalog group");
  return group;
}

test("a ready catalog group shows total, % enriched, stub and retired tiles in order", () => {
  // Arrange / Act — both reads succeed over a 20-movement catalog, 2 of 4 rows retired
  const view = adminDashboardView({
    completeness: { success: true, data: BREAKDOWN, error: null },
    catalog: { success: true, data: ROWS, error: null },
  });

  // Assert
  const group = catalogGroup(view);
  assert.equal(group.state, "ready");
  assert.deepEqual(
    group.state === "ready" ? group.tiles.map((t) => [t.label, t.value]) : [],
    [
      ["Total Exercises", "20"],
      ["% Enriched", "50%"],
      ["Stubs", "4"],
      ["Retired", "2"],
    ],
  );
});

const READY_INPUTS = {
  completeness: { success: true, data: BREAKDOWN, error: null },
  catalog: { success: true, data: ROWS, error: null },
};

test("each catalog tile links into the catalog, filtered where its number is a filter", () => {
  // Arrange / Act
  const group = catalogGroup(adminDashboardView(READY_INPUTS));

  // Assert — Stub and Retired are filters; Total and % Enriched are the whole catalog
  assert.deepEqual(
    group.state === "ready" ? group.tiles.map((t) => [t.key, t.href]) : [],
    [
      ["total", "/admin/exercises"],
      ["enriched", "/admin/exercises"],
      ["stub", "/admin/exercises?completeness=stub"],
      ["retired", "/admin/exercises?status=retired"],
    ],
  );
});

test("each catalog tile's link round-trips through the catalog's filter parser", () => {
  // Arrange
  const group = catalogGroup(adminDashboardView(READY_INPUTS));
  const tiles = group.state === "ready" ? group.tiles : [];
  const parsed = (key: string) => {
    const href = tiles.find((t) => t.key === key)?.href ?? "";
    return parseAdminFilters(new URLSearchParams(href.split("?")[1] ?? ""));
  };

  // Assert — the catalog reads back exactly the filter the tile meant
  assert.equal(parsed("stub").completeness, "stub");
  assert.equal(parsed("stub").status, "all");
  assert.equal(parsed("retired").status, "retired");
  assert.equal(parsed("retired").completeness, "");
  assert.deepEqual(parsed("total"), { query: "", provenance: "", completeness: "", status: "all" });
});

test("an empty catalog shows — on every tile with honest empty copy, never 0%", () => {
  // Arrange / Act — both reads succeed, but there are no Exercises at all
  const group = catalogGroup(
    adminDashboardView({
      completeness: { success: true, data: { stub: 0, listable: 0, enriched: 0, total: 0 }, error: null },
      catalog: { success: true, data: [], error: null },
    }),
  );

  // Assert — still four linked tiles, each reading "—", plus a message
  assert.equal(group.state, "empty");
  if (group.state !== "empty") return;
  assert.deepEqual(
    group.tiles.map((t) => [t.label, t.value]),
    [
      ["Total Exercises", "—"],
      ["% Enriched", "—"],
      ["Stubs", "—"],
      ["Retired", "—"],
    ],
  );
  assert.ok(group.tiles.every((t) => t.href.startsWith("/admin/exercises")));
  assert.equal(group.message, "The catalog has no Exercises yet, so there is nothing to summarize.");
});

test("a refused completeness read fails the catalog group with the backend's reason", () => {
  // Arrange / Act
  const group = catalogGroup(
    adminDashboardView({
      ...READY_INPUTS,
      completeness: { success: false, data: null, error: "Admin access required" },
    }),
  );

  // Assert — no tiles, just the message for an inline alert
  assert.equal(group.state, "failed");
  assert.equal(
    group.state === "failed" ? group.message : "",
    "Could not load the catalog summary: Admin access required",
  );
  assert.ok(!("tiles" in group));
});

test("a rejected catalog read (transport failure) fails the catalog group too", () => {
  // Arrange / Act — the data module caught the rejection as null
  const group = catalogGroup(adminDashboardView({ ...READY_INPUTS, catalog: null }));

  // Assert — a missing reason still yields an honest message
  assert.equal(group.state, "failed");
  assert.equal(
    group.state === "failed" ? group.message : "",
    "Could not load the catalog summary: unknown error",
  );
});

test("a successful envelope with no payload counts as a failed read", () => {
  // Arrange / Act
  const group = catalogGroup(
    adminDashboardView({
      ...READY_INPUTS,
      completeness: { success: true, data: null, error: null },
    }),
  );

  // Assert
  assert.equal(group.state, "failed");
});
