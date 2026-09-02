// Pure key-minting and finish-outcome decision logic for the duplicate-safe finish
// (issue #412 — ADR-0060). Finishing a Live Session must produce exactly one Logged
// Session whatever the network does: the client mints a stable idempotency key and
// the server dedupes on it (#410). The Live Session screen stays a thin shell — it
// owns the effects (crypto, the slot, the network call, navigation) and defers every
// decision here, so the rules below are unit-testable without a browser.

import type { LiveSessionState } from "./live-session.ts";

// The idempotency key a finish sends. A retry of the *same* finish must resend the
// *same* key so the idempotent server write (ADR-0060) upsert-returns the first
// Logged Session instead of creating a second — even when the first write committed
// but its response was lost. Reuse the key already stamped on the performance
// (minted at START and carried through the persisted slot), or mint a fresh one when
// none is present yet (a slot started before this shipped). `mint` is injected
// (crypto.randomUUID in the browser) so this stays pure and testable.
export function resolveFinishKey(
  existing: string | null,
  mint: () => string,
): string {
  return existing !== null && existing !== "" ? existing : mint();
}

// Stamp the resolved key onto the state, returning a new object (never mutating), so
// the key rides in both the persisted slot and the finish payload the mapper builds.
export function stampFinishKey(
  state: LiveSessionState,
  key: string,
): LiveSessionState {
  return { ...state, idempotencyKey: key };
}

// The result of one finish attempt, as the screen observes it: an acknowledged
// success, an error the server returned in the envelope, or a thrown/rejected call
// (offline, a dropped connection — the response never came back at all).
export type FinishAttempt =
  | { status: "acknowledged" }
  | { status: "error"; message: string }
  | { status: "unreachable" };

// What the screen does with the live slot after a finish attempt: clear it only on an
// acknowledged success; retain it — keeping the same key for the retry — on any
// failure, surfacing the error. This is the crux of the duplicate-safe finish: the
// slot never leaves before the server acknowledges, so a dropped connection keeps the
// work (and its key) for a retry rather than losing it or double-writing it.
export type FinishOutcome =
  | { kind: "clear" }
  | { kind: "retain"; error: string };

// Shown when the request never reached the server (offline / dropped connection). The
// work is safe on the device and a retry is available, so the copy reassures.
export const FINISH_UNREACHABLE_MESSAGE =
  "We couldn't reach the server. Your session is saved on this device — retry to finish saving it.";

// Decide what to do with the slot from a finish attempt. Pure: the screen adapts its
// awaited result / thrown error into a `FinishAttempt`, then applies this verdict.
export function decideFinishOutcome(attempt: FinishAttempt): FinishOutcome {
  switch (attempt.status) {
    case "acknowledged":
      return { kind: "clear" };
    case "error":
      return { kind: "retain", error: attempt.message };
    case "unreachable":
      return { kind: "retain", error: FINISH_UNREACHABLE_MESSAGE };
  }
}

// Effect shell: the browser's UUID source, injected into `resolveFinishKey` at the
// call site. Kept out of the pure functions so tests never touch `crypto`.
export function browserMintKey(): string {
  return crypto.randomUUID();
}
