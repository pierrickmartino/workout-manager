// The IndexedDB shell for the finish outbox (issue #413 — ADR-0060). This is the thin,
// untested effect layer around the pure reducer (lib/finish-outbox): it persists the
// queued finishes so a finished workout survives a reload and a full app restart, which
// `localStorage` durability alone (the live slot) does not guarantee for multiple
// records. All decision logic lives in the pure module; this file only opens the DB and
// moves rows. Every call degrades to a safe no-op when IndexedDB is unavailable (SSR, a
// private-mode browser that throws on open), so a caller never has to guard the platform.

import type { OutboxEntry } from "./finish-outbox.ts";

// Namespaced to the app so it never collides with other IndexedDB users, mirroring the
// live slot's `localStorage` key. One object store keyed by the idempotency key — the
// same key the reducer dedupes on — so a re-`put` of the same finish overwrites in place
// rather than duplicating.
const DB_NAME = "workout-manager.finish-outbox";
const STORE_NAME = "entries";
const DB_VERSION = 1;

// Resolve the IndexedDB factory, or null when the platform has none (SSR, or a browser
// where access throws). Reading `indexedDB` can itself throw in some locked-down
// contexts, so even the probe is guarded.
function outboxIndexedDB(): IDBFactory | null {
  try {
    if (typeof indexedDB === "undefined") return null;
    return indexedDB;
  } catch {
    return null;
  }
}

// Open (and, on first use or a version bump, create) the outbox database. Rejects only
// on a genuine open error; callers translate that into a safe no-op.
function openOutboxDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const factory = outboxIndexedDB();
    if (!factory) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("open failed"));
  });
}

// Run `work` against the object store in one transaction and resolve when it commits.
// Any failure — no IndexedDB, a blocked open, an aborted transaction — resolves to
// `fallback` instead of throwing, so the outbox never crashes a finish or a drain.
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest | null,
  fallback: T,
  read?: (request: IDBRequest) => T,
): Promise<T> {
  let db: IDBDatabase | null = null;
  try {
    db = await openOutboxDb();
  } catch {
    return fallback;
  }
  try {
    return await new Promise<T>((resolve) => {
      const tx = db!.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = work(store);
      let value = fallback;
      if (request && read) {
        request.onsuccess = () => {
          value = read(request);
        };
      }
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => resolve(fallback);
      tx.onabort = () => resolve(fallback);
    });
  } catch {
    return fallback;
  } finally {
    db?.close();
  }
}

// Read the whole persisted queue (every account's — the pure reducer scopes reads to the
// current owner and drives the foreign-entry purge). Resolves `[]` on any failure, so a
// missing or unreadable store looks like an empty outbox, never an error.
export function loadOutbox(): Promise<OutboxEntry[]> {
  return withStore<OutboxEntry[]>(
    "readonly",
    (store) => store.getAll(),
    [],
    (request) => (request.result as OutboxEntry[]) ?? [],
  );
}

// Persist one entry (insert or overwrite by key). Used to enqueue a finish, to stamp
// `syncing` before a delivery attempt, and to record a `failed` attempt.
export function saveOutboxEntry(entry: OutboxEntry): Promise<void> {
  return withStore<void>("readwrite", (store) => store.put(entry), undefined);
}

// Remove one delivered entry by its key — the durable half of "synced".
export function removeOutboxEntry(key: string): Promise<void> {
  return withStore<void>("readwrite", (store) => store.delete(key), undefined);
}

// Empty the whole outbox — the sign-out purge (ADR-0059), clearing every account's
// queued finishes on the shared device before Clerk signs out.
export function clearOutbox(): Promise<void> {
  return withStore<void>("readwrite", (store) => store.clear(), undefined);
}
