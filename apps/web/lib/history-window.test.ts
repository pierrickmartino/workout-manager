import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HISTORY_WINDOW,
  INITIAL_HISTORY_WINDOW_STATE,
  filtersFromSearchParams,
  historyWindowReducer,
  historyWindowIdsQuery,
  isValidHistoryWindowIds,
  planHistoryWindow,
  resolveHistoryCards,
  toHistoryCard,
  windowIds,
  type HistoryCard,
  type HistoryWindowState,
} from "./history-window.ts";
import { filterHistory } from "./history-filter.ts";
import type { HistoryIndexRow, LoggedSession } from "./logs-types.ts";

// `history-window` is the view-model behind the windowed History screen (ADR-0128): the
// client holds the whole index, filters over it, and shows full cards for the first
// `visibleCount` matches, fetching any it does not hold yet in batches of `HISTORY_WINDOW`.

function row(id: number, overrides: Partial<HistoryIndexRow> = {}): HistoryIndexRow {
  return {
    id,
    performed_on: "2026-06-20",
    training_type: "strength",
    exercise_names: ["Back Squat"],
    deletable: true,
    uncompletable: true,
    ...overrides,
  };
}

function card(id: number, overrides: Partial<HistoryCard> = {}): HistoryCard {
  return {
    id,
    session_id: null,
    training_type: "strength",
    performed_on: "2026-06-20",
    completion_outcome: null,
    logged_sets: [],
    ...overrides,
  };
}

function rows(count: number): HistoryIndexRow[] {
  return Array.from({ length: count }, (_, i) => row(i + 1));
}

function state(overrides: Partial<HistoryWindowState> = {}): HistoryWindowState {
  return { ...INITIAL_HISTORY_WINDOW_STATE, ...overrides };
}

// --- toHistoryCard ---------------------------------------------------------------

test("toHistoryCard keeps what a History card shows and drops the rest of the wire record", () => {
  // Arrange
  const record: LoggedSession = {
    id: 7,
    clerk_user_id: "user_secret",
    session_id: 3,
    training_type: "strength",
    performed_on: "2026-06-20",
    completion_outcome: "completed",
    duration_seconds: 1800,
    logged_sets: [],
    deletable: false,
    uncompletable: false,
  };

  // Act
  const result = toHistoryCard(record);

  // Assert: the verdicts come from the index, so the card never carries a stale copy
  assert.deepEqual(result, {
    id: 7,
    session_id: 3,
    training_type: "strength",
    performed_on: "2026-06-20",
    completion_outcome: "completed",
    logged_sets: [],
  });
});

// --- windowIds -------------------------------------------------------------------

test("windowIds takes the first window of matching ids, in history order", () => {
  // Arrange
  const index = rows(HISTORY_WINDOW + 5);

  // Act
  const ids = windowIds(index);

  // Assert
  assert.equal(ids.length, HISTORY_WINDOW);
  assert.deepEqual(ids.slice(0, 3), [1, 2, 3]);
});

test("the server's first window for a deep link is the first matches of the same filter the client runs", () => {
  // Arrange: a shared link filtering to hiit (ADR-0100)
  const index = [
    row(1, { training_type: "strength" }),
    row(2, { training_type: "hiit" }),
    row(3, { training_type: "hiit" }),
  ];
  const filters = filtersFromSearchParams({ type: "hiit" });

  // Act
  const ids = windowIds(filterHistory(index, filters));

  // Assert
  assert.deepEqual(ids, [2, 3]);
});

// --- filtersFromSearchParams -----------------------------------------------------

test("filtersFromSearchParams reads a Next searchParams bag, single or repeated", () => {
  // Act
  const filters = filtersFromSearchParams({
    exercise: "Deadlift",
    type: ["strength", "hiit"],
    unrelated: undefined,
  });

  // Assert
  assert.deepEqual(filters, { exercise: "Deadlift", trainingTypes: ["strength", "hiit"] });
});

test("filtersFromSearchParams drops an unknown training type, as the client parse does", () => {
  assert.deepEqual(filtersFromSearchParams({ type: "marketing" }), {
    exercise: null,
    trainingTypes: [],
  });
});

// --- isValidHistoryWindowIds / historyWindowIdsQuery ------------------------------

test("isValidHistoryWindowIds accepts one window of positive integer ids", () => {
  assert.equal(isValidHistoryWindowIds([1, 2, 3]), true);
});

test("isValidHistoryWindowIds rejects what the client must never send", () => {
  assert.equal(isValidHistoryWindowIds([]), false);
  assert.equal(isValidHistoryWindowIds([0]), false);
  assert.equal(isValidHistoryWindowIds([1.5]), false);
  assert.equal(isValidHistoryWindowIds(["1"]), false);
  assert.equal(isValidHistoryWindowIds("1,2"), false);
  assert.equal(
    isValidHistoryWindowIds(Array.from({ length: HISTORY_WINDOW + 1 }, (_, i) => i + 1)),
    false,
  );
});

test("historyWindowIdsQuery repeats the ids param", () => {
  assert.equal(historyWindowIdsQuery([4, 9]), "ids=4&ids=9");
});

// --- resolveHistoryCards -----------------------------------------------------------

test("resolveHistoryCards prefers the server's fresh window over a fetched copy", () => {
  // Arrange: a card fetched earlier, then revalidated by the server with a new outcome
  const fetched = new Map([[1, card(1, { completion_outcome: "completed" })]]);
  const fresh = [card(1, { completion_outcome: "incomplete" }), card(2)];

  // Act
  const cards = resolveHistoryCards(fetched, fresh);

  // Assert
  assert.equal(cards.get(1)?.completion_outcome, "incomplete");
  assert.equal(cards.size, 2);
  assert.equal(fetched.get(1)?.completion_outcome, "completed"); // never mutated
});

// --- planHistoryWindow -------------------------------------------------------------

test("planHistoryWindow shows the loaded matches in index order with the index's verdicts", () => {
  // Arrange
  const matches = [row(2, { deletable: false }), row(1)];
  const cards = new Map([
    [1, card(1)],
    [2, card(2)],
  ]);

  // Act
  const view = planHistoryWindow(matches, cards, state());

  // Assert
  assert.deepEqual(
    view.entries.map((entry) => [entry.card.id, entry.deletable]),
    [
      [2, false],
      [1, true],
    ],
  );
  assert.deepEqual(view.toRequest, []);
  assert.equal(view.hiddenCount, 0);
});

test("planHistoryWindow requests the visible matches it does not hold yet", () => {
  // Arrange: a filter matched records beyond the first window the server sent
  const matches = [row(1), row(40), row(41)];
  const cards = new Map([[1, card(1)]]);

  // Act
  const view = planHistoryWindow(matches, cards, state());

  // Assert
  assert.deepEqual(view.toRequest, [40, 41]);
  assert.equal(view.pendingCount, 2);
});

test("planHistoryWindow never re-requests an id in flight or one that failed", () => {
  // Arrange
  const matches = [row(1), row(2), row(3)];

  // Act
  const view = planHistoryWindow(
    matches,
    new Map(),
    state({ inFlight: new Set([1]), failed: new Set([2]) }),
  );

  // Assert
  assert.deepEqual(view.toRequest, [3]);
  assert.equal(view.pendingCount, 2);
  assert.equal(view.failedCount, 1);
});

test("planHistoryWindow drops an id the server no longer returns", () => {
  // Arrange: 2 was asked for and did not come back (deleted in another tab)
  const matches = [row(1), row(2)];
  const cards = new Map([[1, card(1)]]);

  // Act
  const view = planHistoryWindow(matches, cards, state({ settled: new Set([1, 2]) }));

  // Assert: shown as nothing, and never asked for again
  assert.deepEqual(
    view.entries.map((entry) => entry.card.id),
    [1],
  );
  assert.deepEqual(view.toRequest, []);
  assert.equal(view.pendingCount, 0);
});

test("planHistoryWindow caps one request at a window and reports the matches beyond it", () => {
  // Arrange
  const matches = rows(HISTORY_WINDOW * 2 + 3);

  // Act
  const view = planHistoryWindow(
    matches,
    new Map(),
    state({ visibleCount: HISTORY_WINDOW * 2 }),
  );

  // Assert
  assert.equal(view.toRequest.length, HISTORY_WINDOW);
  assert.equal(view.hiddenCount, 3);
});

// --- historyWindowReducer ----------------------------------------------------------

test("show more widens the visible matches by one window", () => {
  const next = historyWindowReducer(state(), { type: "show-more" });

  assert.equal(next.visibleCount, HISTORY_WINDOW * 2);
});

test("a filter change shows one window again but keeps the cards already fetched", () => {
  // Arrange
  const before = state({
    visibleCount: HISTORY_WINDOW * 3,
    fetched: new Map([[5, card(5)]]),
  });

  // Act
  const next = historyWindowReducer(before, { type: "filters-changed" });

  // Assert
  assert.equal(next.visibleCount, HISTORY_WINDOW);
  assert.equal(next.fetched.get(5)?.id, 5);
});

test("a request moves its ids in flight, and success settles them and merges the cards", () => {
  // Arrange
  const requested = historyWindowReducer(state(), { type: "requested", ids: [1, 2] });

  // Act: only 1 came back
  const done = historyWindowReducer(requested, {
    type: "succeeded",
    ids: [1, 2],
    cards: [card(1)],
  });

  // Assert
  assert.deepEqual([...requested.inFlight], [1, 2]);
  assert.deepEqual([...done.inFlight], []);
  assert.deepEqual([...done.settled].sort(), [1, 2]);
  assert.equal(done.fetched.get(1)?.id, 1);
});

test("a failed request marks its ids failed until a retry clears them", () => {
  // Arrange
  const requested = historyWindowReducer(state(), { type: "requested", ids: [1] });

  // Act
  const failed = historyWindowReducer(requested, { type: "failed", ids: [1] });
  const retried = historyWindowReducer(failed, { type: "retry" });

  // Assert
  assert.deepEqual([...failed.inFlight], []);
  assert.deepEqual([...failed.failed], [1]);
  assert.deepEqual([...retried.failed], []);
});

test("a corrected record replaces its fetched copy", () => {
  // Arrange
  const before = state({ fetched: new Map([[1, card(1, { completion_outcome: "completed" })]]) });

  // Act
  const next = historyWindowReducer(before, {
    type: "corrected",
    card: card(1, { completion_outcome: "incomplete" }),
  });

  // Assert
  assert.equal(next.fetched.get(1)?.completion_outcome, "incomplete");
  assert.equal(before.fetched.get(1)?.completion_outcome, "completed"); // immutability
});

test("a late response for a stale request still merges: a correct record is never wrong to keep", () => {
  // Arrange: the filter changed while the request was out
  const requested = historyWindowReducer(state(), { type: "requested", ids: [9] });
  const changed = historyWindowReducer(requested, { type: "filters-changed" });

  // Act
  const done = historyWindowReducer(changed, { type: "succeeded", ids: [9], cards: [card(9)] });

  // Assert
  assert.equal(done.fetched.get(9)?.id, 9);
});
