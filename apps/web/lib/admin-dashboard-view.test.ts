import { test } from "node:test";
import assert from "node:assert/strict";

import { adminDashboardView, rejectedRead } from "./admin-dashboard-view.ts";
import { parseAdminFilters } from "./admin-exercises-view.ts";

const BREAKDOWN = { stub: 4, listable: 6, enriched: 10, total: 20 };

// The retired read is one row of the retired-filtered catalog page; its `meta.total` is the
// exact count, however many rows the page itself carries.
function retiredPage(total: number) {
  return { success: true, data: [], error: null, meta: { total, limit: 1, offset: 0 } };
}

function catalogGroup(view: ReturnType<typeof adminDashboardView>) {
  const group = view.groups.find((g) => g.key === "catalog");
  assert.ok(group, "the dashboard always carries a catalog group");
  return group;
}

test("a ready catalog group shows total, % enriched, stub and retired tiles in order", () => {
  // Arrange / Act — both reads succeed over a 20-movement catalog, 2 of them retired
  const view = adminDashboardView({
    completeness: { success: true, data: BREAKDOWN, error: null },
    retired: retiredPage(2),
    generationCalls: rejectedRead(),
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
  retired: retiredPage(2),
  // The AI group's own reads; a failure there never reaches the catalog group.
  generationCalls: rejectedRead(),
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
      retired: retiredPage(0),
      generationCalls: rejectedRead(),
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

test("a rejected retired read (transport failure) fails the catalog group with a real reason", () => {
  // Arrange / Act — the data module turned the rejection into a failed read
  const group = catalogGroup(
    adminDashboardView({ ...READY_INPUTS, retired: rejectedRead() }),
  );

  // Assert — the reason names what happened, never "unknown error"
  assert.equal(group.state, "failed");
  assert.equal(
    group.state === "failed" ? group.message : "",
    "Could not load the catalog summary: the API could not be reached",
  );
});

test("the Retired tile reads the exact retired total, not the rows the page carried", () => {
  // Arrange / Act — 742 retired Exercises, far past any one page of rows
  const group = catalogGroup(adminDashboardView({ ...READY_INPUTS, retired: retiredPage(742) }));

  // Assert
  assert.equal(
    group.state === "ready" ? group.tiles.find((t) => t.key === "retired")?.value : "",
    "742",
  );
});

test("a retired page without a total fails the catalog group rather than guessing", () => {
  // Arrange / Act
  const group = catalogGroup(
    adminDashboardView({
      ...READY_INPUTS,
      retired: { success: true, data: [], error: null },
    }),
  );

  // Assert
  assert.equal(
    group.state === "failed" ? group.message : "",
    "Could not load the catalog summary: the response carried no data",
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

  // Assert — no backend reason, so the message says what was missing
  assert.equal(
    group.state === "failed" ? group.message : "",
    "Could not load the catalog summary: the response carried no data",
  );
});
