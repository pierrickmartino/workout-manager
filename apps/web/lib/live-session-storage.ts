// Single-slot `localStorage` persistence for the Live Session (issue #91 — F2·S6).
// The whole engine state (lib/live-session) is kept in ONE key so a refresh or a
// phone-lock mid-workout can resume exactly where the user left off (ADR-0012:
// ephemeral, client-side, at most one Live Session at a time). Stored data is
// never trusted — a malformed or stale-shaped slot deserializes to null, so the
// caller falls back to a fresh start rather than crashing on a corrupt slot.

import type { LiveSessionState, LiveStatus, SetStatus } from "./live-session.ts";

// The one key the single slot lives under. Namespaced to the app so it never
// collides with other `localStorage` users.
export const LIVE_SESSION_SLOT_KEY = "workout-manager.live-session";

// The minimal subset of the Web Storage API the slot needs. Injected so the
// persistence logic is testable without a DOM, and satisfied by `localStorage`.
export interface SlotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Persist the Live Session state to the single slot, overwriting any prior one.
export function saveLiveSession(
  storage: SlotStorage,
  state: LiveSessionState,
): void {
  storage.setItem(LIVE_SESSION_SLOT_KEY, JSON.stringify(state));
}

// Read the persisted Live Session, or null when the slot is empty, unparseable, or
// does not hold a well-formed state. Never throws on bad data — a corrupt slot is
// treated as no slot.
export function loadLiveSession(storage: SlotStorage): LiveSessionState | null {
  const raw = storage.getItem(LIVE_SESSION_SLOT_KEY);
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isLiveSessionState(parsed)) return null;
    // Normalize a slot written before #412 (no finish key) to an explicit null, so the
    // resumed state is well-typed (`string | null`) and its finish mints a key rather
    // than reading an `undefined` (ADR-0060). A keyed slot passes through unchanged.
    return { ...parsed, idempotencyKey: parsed.idempotencyKey ?? null };
  } catch {
    // Malformed JSON — fall back to empty rather than propagating the parse error.
    return null;
  }
}

// Empty the single slot — used on finish and on idle auto-end, once the
// performance has been recorded.
export function clearLiveSession(storage: SlotStorage): void {
  storage.removeItem(LIVE_SESSION_SLOT_KEY);
}

const LIVE_STATUSES: readonly LiveStatus[] = [
  "not_started",
  "in_progress",
  "finished",
];
const SET_STATUSES: readonly SetStatus[] = ["pending", "completed"];

// Structural guard for a deserialized slot. Validates the fields the engine and
// its derivations read, so a value from an older schema (or hand-tampered slot)
// is rejected instead of flowing in as a malformed state.
function isLiveSessionState(value: unknown): value is LiveSessionState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;

  return (
    typeof state.sessionId === "number" &&
    // The owner's Clerk account id (ADR-0059). Required as a string, so a legacy slot
    // written before account-scoping (no id) is rejected here — the same "start fresh"
    // outcome as any structurally invalid slot, rather than a guessed owner. A stored
    // slot always carries a real id (START stamps it before the first persist).
    typeof state.accountId === "string" &&
    // The client-minted finish idempotency key (ADR-0060, issue #412). Unlike the owner
    // id, an absent/null key must NOT purge the slot: a keyed START stamps a string, but
    // a slot written before this shipped carries none — it is still valid to resume and
    // mints a key at finish. So absent (undefined) and null both pass; only a wrong
    // *type* (a non-string key) is rejected. `loadLiveSession` normalizes absent → null.
    (state.idempotencyKey === undefined ||
      isNullableString(state.idempotencyKey)) &&
    typeof state.currentIndex === "number" &&
    isLiveStatus(state.status) &&
    isNullableNumber(state.startedAt) &&
    isNullableNumber(state.lastActivityAt) &&
    Array.isArray(state.sets) &&
    state.sets.every(isLiveSet)
  );
}

function isLiveSet(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const set = value as Record<string, unknown>;
  return (
    typeof set.exerciseId === "number" &&
    typeof set.exerciseName === "string" &&
    typeof set.setNumber === "number" &&
    SET_STATUSES.includes(set.status as SetStatus) &&
    // Superset overlay (ADR-0023, added in #161). A slot from an older schema
    // lacks these, so requiring them rejects a legacy slot before its missing
    // fields are read: an undefined `supersetLabel` would otherwise render
    // "SUPERSET undefined", and a falsy `restsAfter` would suppress every rest
    // timer. A rejected slot deserializes to null → the caller starts fresh.
    typeof set.unitIndex === "number" &&
    isNullableString(set.supersetGroup) &&
    isNullableString(set.supersetLabel) &&
    typeof set.restsAfter === "boolean" &&
    isNullableNumber(set.restSeconds)
  );
}

function isLiveStatus(value: unknown): value is LiveStatus {
  return LIVE_STATUSES.includes(value as LiveStatus);
}

function isNullableNumber(value: unknown): boolean {
  return value === null || typeof value === "number";
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

// Browser convenience wrappers over `window.localStorage`, guarded so they are
// no-ops during SSR (no `window`). The screen uses these; the pure functions above
// (with an injected Storage) are what the tests exercise.
function browserStorage(): SlotStorage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readLiveSessionSlot(): LiveSessionState | null {
  const storage = browserStorage();
  return storage ? loadLiveSession(storage) : null;
}

export function writeLiveSessionSlot(state: LiveSessionState): void {
  const storage = browserStorage();
  if (storage) saveLiveSession(storage, state);
}

export function clearLiveSessionSlot(): void {
  const storage = browserStorage();
  if (storage) clearLiveSession(storage);
}

// Purge every user-scoped local live store before a sign-out (ADR-0059), so a shared
// browser profile never hands the next signed-in account the previous one's data. In
// v1 that is the single live slot; as later stores are added (the finish outbox,
// ADR-0060, and any user-specific caches) this is the one teardown seam that clears
// them, called before Clerk's `signOut()` completes.
export function purgeLocalLiveState(): void {
  clearLiveSessionSlot();
}
