// The "last synced" timestamp store (issue #414). The honesty rule is that "Last synced …"
// appears ONLY on a real server acknowledgement — so this is written from exactly one place:
// the outbox drain's success branch, when a finish is delivered and the server confirms the
// write (lib/finish-outbox-sync). It is read by the sync-state UI to show when the last
// finish actually landed.
//
// Account-scoped (ADR-0059): a shared browser must never show one account's last-synced time
// to the next signed-in user, so the stamp carries its owner and a read for a different
// account returns null. This is a thin, untested `localStorage` effect shell, guarded to a
// no-op during SSR and in locked-down browsers where storage access throws.

// One key; the value carries its owner so a foreign read is rejected rather than leaked.
const LAST_SYNCED_KEY = "workout-manager.last-synced";

interface LastSyncedRecord {
  accountId: string;
  at: number;
}

// Structural guard for a deserialized stamp — narrows untrusted `JSON.parse` output before
// any field is read, so a malformed or older-shaped value is rejected rather than trusted.
function isLastSyncedRecord(value: unknown): value is LastSyncedRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LastSyncedRecord).accountId === "string" &&
    typeof (value as LastSyncedRecord).at === "number"
  );
}

function browserStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

// Record that this account's finish was acknowledged by the server at `at` (epoch ms).
// Overwrites any prior stamp — only the most recent acknowledgement matters.
export function recordLastSynced(accountId: string, at: number): void {
  const storage = browserStorage();
  if (!storage) return;
  const record: LastSyncedRecord = { accountId, at };
  try {
    storage.setItem(LAST_SYNCED_KEY, JSON.stringify(record));
  } catch {
    // Storage full or blocked — the timestamp is a nicety, not a durability guarantee.
  }
}

// The epoch-ms instant this account last had a finish acknowledged, or null when none is
// recorded (or the stamp belongs to another account — reject-foreign on read).
export function readLastSynced(accountId: string | null): number | null {
  if (accountId === null) return null;
  const storage = browserStorage();
  if (!storage) return null;
  const raw = storage.getItem(LAST_SYNCED_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // Reject a stamp belonging to another account (reject-foreign on read, ADR-0059).
    if (isLastSyncedRecord(parsed) && parsed.accountId === accountId) {
      return parsed.at;
    }
    return null;
  } catch {
    return null;
  }
}

// Clear the stamp — part of the sign-out purge (ADR-0059), for hygiene on a shared device
// (a read is already account-guarded, so this is defense in depth, not the safety boundary).
export function clearLastSynced(): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.removeItem(LAST_SYNCED_KEY);
  } catch {
    // Nothing to do — a failed clear is covered by the account-guarded read.
  }
}
