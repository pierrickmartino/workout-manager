// View-model for the windowed History screen (ADR-0128). This module has NO server-only
// imports, so the Server Component page, the Server Action and the Client Component share it.
//
// The client holds the whole History index and filters over it (`history-filter`), so the
// filter, its count and the exercise picker always see the whole record. Full records —
// "cards" — arrive in windows: the server renders the first `HISTORY_WINDOW` matches, and the
// client fetches any visible match it does not hold yet, in batches of the same size, by id.
// The state lives in one reducer so every transition is a pure, tested function.

import { parseHistoryFilters, type HistoryFilters } from "./history-filter.ts";
import type { HistoryIndexRow, LoggedSession } from "./logs-types";

// How many cards one window holds: the first paint, each "Show more", and one id batch. Matches
// the backend's `HISTORY_WINDOW_MAX`, which rejects a larger batch.
export const HISTORY_WINDOW = 30;

// What a History card renders. The wire record's owner id and Session Duration are not shown
// on the card, and its correction verdicts come from the index, which is always current.
export type HistoryCard = Omit<
  LoggedSession,
  "clerk_user_id" | "duration_seconds" | "deletable" | "uncompletable"
>;

export function toHistoryCard(record: LoggedSession): HistoryCard {
  return {
    id: record.id,
    session_id: record.session_id,
    training_type: record.training_type,
    performed_on: record.performed_on,
    completion_outcome: record.completion_outcome,
    logged_sets: record.logged_sets,
  };
}

// The ids of the first window of `matches`, in history order — what the server fetches for
// the first paint, so a shared filtered link renders its matches without a client fetch.
export function windowIds(matches: readonly HistoryIndexRow[]): number[] {
  return matches.slice(0, HISTORY_WINDOW).map((match) => match.id);
}

// A Next.js `searchParams` bag: each key is absent, a single string, or repeated.
export type RawSearchParams = Record<string, string | string[] | undefined>;

// The History filters a request URL carries, parsed exactly as the client parses them, so the
// server picks the same first window the client will show (ADR-0100).
export function filtersFromSearchParams(raw: RawSearchParams): HistoryFilters {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    for (const item of value === undefined ? [] : [value].flat()) {
      params.append(key, item);
    }
  }
  return parseHistoryFilters(params);
}

// Whether an untrusted value is one window of record ids — the Server Action's boundary check.
export function isValidHistoryWindowIds(ids: unknown): ids is number[] {
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= HISTORY_WINDOW &&
    ids.every((id) => Number.isInteger(id) && id > 0)
  );
}

// The query string for one id batch (`GET /api/logs?ids=…`).
export function historyWindowIdsQuery(ids: readonly number[]): string {
  return ids.map((id) => `ids=${id}`).join("&");
}

// Every card the client holds: what it fetched, overlaid with the server's latest window. The
// server's copy wins because a revalidation re-renders it from a fresh read.
export function resolveHistoryCards(
  fetched: ReadonlyMap<number, HistoryCard>,
  serverWindow: readonly HistoryCard[],
): Map<number, HistoryCard> {
  const cards = new Map(fetched);
  for (const serverCard of serverWindow) {
    cards.set(serverCard.id, serverCard);
  }
  return cards;
}

export interface HistoryWindowState {
  // How many matches are on screen: one window, plus one per "Show more".
  visibleCount: number;
  // Cards fetched by the client, by id.
  fetched: ReadonlyMap<number, HistoryCard>;
  // Ids a successful batch asked for. One that did not come back is gone (deleted elsewhere)
  // and is neither shown nor asked for again; the next revalidation drops it from the index.
  settled: ReadonlySet<number>;
  inFlight: ReadonlySet<number>;
  // Ids whose batch failed, held back until the user retries.
  failed: ReadonlySet<number>;
}

export const INITIAL_HISTORY_WINDOW_STATE: HistoryWindowState = {
  visibleCount: HISTORY_WINDOW,
  fetched: new Map(),
  settled: new Set(),
  inFlight: new Set(),
  failed: new Set(),
};

export type HistoryWindowAction =
  | { type: "show-more" }
  | { type: "filters-changed" }
  | { type: "requested"; ids: readonly number[] }
  | { type: "succeeded"; ids: readonly number[]; cards: readonly HistoryCard[] }
  | { type: "failed"; ids: readonly number[] }
  | { type: "retry" }
  | { type: "corrected"; card: HistoryCard };

function withIds(set: ReadonlySet<number>, ids: readonly number[]): Set<number> {
  return new Set([...set, ...ids]);
}

function withoutIds(set: ReadonlySet<number>, ids: readonly number[]): Set<number> {
  const drop = new Set(ids);
  return new Set([...set].filter((id) => !drop.has(id)));
}

function withCards(
  fetched: ReadonlyMap<number, HistoryCard>,
  cards: readonly HistoryCard[],
): Map<number, HistoryCard> {
  return new Map([...fetched, ...cards.map((c) => [c.id, c] as const)]);
}

// Every transition of the window. A response is merged whenever it lands, even after the
// filter moved on: merging by id is idempotent and a correct record is never wrong to keep, so
// no request needs cancelling.
export function historyWindowReducer(
  state: HistoryWindowState,
  action: HistoryWindowAction,
): HistoryWindowState {
  switch (action.type) {
    case "show-more":
      return { ...state, visibleCount: state.visibleCount + HISTORY_WINDOW };
    case "filters-changed":
      return { ...state, visibleCount: HISTORY_WINDOW };
    case "requested":
      return { ...state, inFlight: withIds(state.inFlight, action.ids) };
    case "succeeded":
      return {
        ...state,
        fetched: withCards(state.fetched, action.cards),
        settled: withIds(state.settled, action.ids),
        inFlight: withoutIds(state.inFlight, action.ids),
      };
    case "failed":
      return {
        ...state,
        inFlight: withoutIds(state.inFlight, action.ids),
        failed: withIds(state.failed, action.ids),
      };
    case "retry":
      return { ...state, failed: new Set() };
    case "corrected":
      return { ...state, fetched: withCards(state.fetched, [action.card]) };
  }
}

export interface HistoryWindowEntry {
  card: HistoryCard;
  deletable: boolean;
  uncompletable: boolean;
}

export interface HistoryWindowView {
  // The visible matches the client holds a card for, in history order.
  entries: HistoryWindowEntry[];
  // The next batch to fetch (at most one window): visible, not held, not in flight, not failed.
  toRequest: number[];
  // Visible matches still on their way (to fetch or in flight).
  pendingCount: number;
  // Visible matches whose batch failed.
  failedCount: number;
  // Matches beyond the visible window — what "Show more" would reveal.
  hiddenCount: number;
}

export function planHistoryWindow(
  matches: readonly HistoryIndexRow[],
  cards: ReadonlyMap<number, HistoryCard>,
  state: HistoryWindowState,
): HistoryWindowView {
  const entries: HistoryWindowEntry[] = [];
  const missing: number[] = [];
  let pendingCount = 0;
  let failedCount = 0;

  for (const match of matches.slice(0, state.visibleCount)) {
    const card = cards.get(match.id);
    if (card !== undefined) {
      entries.push({ card, deletable: match.deletable, uncompletable: match.uncompletable });
    } else if (state.failed.has(match.id)) {
      failedCount += 1;
    } else if (state.inFlight.has(match.id)) {
      pendingCount += 1;
    } else if (!state.settled.has(match.id)) {
      pendingCount += 1;
      missing.push(match.id);
    }
  }

  return {
    entries,
    toRequest: missing.slice(0, HISTORY_WINDOW),
    pendingCount,
    failedCount,
    hiddenCount: Math.max(0, matches.length - state.visibleCount),
  };
}
