import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GENERATION_CALL_PAGE_SIZE,
  auditLogHref,
  generationCallsApiQuery,
  hasAuditLogFilters,
  parseAuditLogState,
  toAuditLogPager,
  type AuditLogState,
} from "./admin-generation-calls-query.ts";

const NO_FILTERS = { generatorKind: null, outcome: null, userId: null } as const;

function state(overrides: Partial<AuditLogState> = {}): AuditLogState {
  return { filters: NO_FILTERS, page: 1, ...overrides };
}

// --- Parsing the page URL --------------------------------------------------------------

test("an empty URL is the unfiltered first page", () => {
  assert.deepEqual(parseAuditLogState({}), state());
});

test("reads every filter and the page from the URL", () => {
  // Act
  const parsed = parseAuditLogState({
    kind: "protocol",
    outcome: "error",
    user: "user_alice",
    page: "3",
  });

  // Assert
  assert.deepEqual(parsed, {
    filters: { generatorKind: "protocol", outcome: "error", userId: "user_alice" },
    page: 3,
  });
});

test("drops an unknown kind or outcome rather than sending it to the API", () => {
  const parsed = parseAuditLogState({ kind: "workout", outcome: "timeout" });

  assert.deepEqual(parsed.filters, NO_FILTERS);
});

test("does not read inherited object keys as a known kind", () => {
  assert.equal(parseAuditLogState({ kind: "toString" }).filters.generatorKind, null);
});

test("trims the user id and reads a blank one as no filter", () => {
  assert.equal(parseAuditLogState({ user: "  user_bob  " }).filters.userId, "user_bob");
  assert.equal(parseAuditLogState({ user: "   " }).filters.userId, null);
});

test("a garbage or non-positive page falls back to the first", () => {
  for (const page of ["0", "-2", "1.5", "abc", ""]) {
    assert.equal(parseAuditLogState({ page }).page, 1, `page=${page}`);
  }
});

test("a repeated query parameter takes its first value", () => {
  const parsed = parseAuditLogState({ kind: ["session", "protocol"], page: ["2", "9"] });

  assert.equal(parsed.filters.generatorKind, "session");
  assert.equal(parsed.page, 2);
});

test("the log is filtered when any one filter is set", () => {
  assert.equal(hasAuditLogFilters(NO_FILTERS), false);
  assert.equal(hasAuditLogFilters({ ...NO_FILTERS, generatorKind: "session" }), true);
  assert.equal(hasAuditLogFilters({ ...NO_FILTERS, outcome: "error" }), true);
  assert.equal(hasAuditLogFilters({ ...NO_FILTERS, userId: "user_a" }), true);
});

// --- Building the API query ------------------------------------------------------------

test("the unfiltered first page asks only for the window", () => {
  assert.equal(
    generationCallsApiQuery(state()),
    `limit=${GENERATION_CALL_PAGE_SIZE}&offset=0`,
  );
});

test("set filters become the endpoint's parameters and the page its offset", () => {
  // Arrange
  const filtered = state({
    filters: { generatorKind: "protocol", outcome: "error", userId: "user_alice" },
    page: 3,
  });

  // Act / Assert — page 3 of 50 starts at the 101st call
  assert.equal(
    generationCallsApiQuery(filtered),
    "generator_kind=protocol&outcome=error&clerk_user_id=user_alice&limit=50&offset=100",
  );
});

test("a user id is URL-encoded", () => {
  const query = generationCallsApiQuery(
    state({ filters: { ...NO_FILTERS, userId: "a&b=c" } }),
  );

  assert.match(query, /^clerk_user_id=a%26b%3Dc&/);
});

// --- Page links ------------------------------------------------------------------------

test("the first unfiltered page links to the bare log", () => {
  assert.equal(auditLogHref(state()), "/admin/ai-audit-log");
});

test("a page link keeps the filters", () => {
  const href = auditLogHref(
    state({ filters: { ...NO_FILTERS, outcome: "error", userId: "user_bob" }, page: 2 }),
  );

  assert.equal(href, "/admin/ai-audit-log?outcome=error&user=user_bob&page=2");
});

test("a page link round-trips through the parser", () => {
  // Arrange
  const original = state({
    filters: { generatorKind: "substitute", outcome: "success", userId: "user_x" },
    page: 4,
  });

  // Act
  const params = new URL(auditLogHref(original), "https://pulse.test").searchParams;

  // Assert
  assert.deepEqual(parseAuditLogState(Object.fromEntries(params)), original);
});

// --- The pager -------------------------------------------------------------------------

test("a single page of results needs no pager", () => {
  const pager = toAuditLogPager(state(), { total: 12, limit: 50, offset: 0 });

  assert.equal(pager, null);
});

test("the first of several pages links only to older calls", () => {
  // Arrange
  const current = state({ filters: { ...NO_FILTERS, outcome: "error" } });

  // Act
  const pager = toAuditLogPager(current, { total: 120, limit: 50, offset: 0 });

  // Assert
  assert.deepEqual(pager, {
    rangeLabel: "1–50 of 120",
    newerHref: null,
    olderHref: "/admin/ai-audit-log?outcome=error&page=2",
  });
});

test("a middle page links both ways", () => {
  const pager = toAuditLogPager(state({ page: 2 }), { total: 120, limit: 50, offset: 50 });

  assert.deepEqual(pager, {
    rangeLabel: "51–100 of 120",
    newerHref: "/admin/ai-audit-log",
    olderHref: "/admin/ai-audit-log?page=3",
  });
});

test("the last page is partial and links only to newer calls", () => {
  const pager = toAuditLogPager(state({ page: 3 }), { total: 120, limit: 50, offset: 100 });

  assert.deepEqual(pager, {
    rangeLabel: "101–120 of 120",
    newerHref: "/admin/ai-audit-log?page=2",
    olderHref: null,
  });
});

test("a page past the end still offers the way back", () => {
  // A hand-edited ?page= beyond the results, or calls expiring between two reads.
  const pager = toAuditLogPager(state({ page: 9 }), { total: 120, limit: 50, offset: 400 });

  assert.deepEqual(pager, {
    rangeLabel: "0 of 120",
    newerHref: "/admin/ai-audit-log?page=8",
    olderHref: null,
  });
});
