// A tiny in-tab change bus for the finish outbox (issue #414). The outbox lives in
// IndexedDB (lib/finish-outbox-store) and is mutated from two places — the finish flow
// that enqueues, and the app-scope drain (OutboxSyncRegistrar) that delivers — neither of
// which React observes. The honest sync-state UI must reflect those mutations live, so the
// effectful writers publish a change here and the UI hook (lib/use-sync-status) subscribes.
//
// This is an untested effect shell, like the store and the sync orchestration it sits
// beside. It carries no state of its own: it only fans out a "something in the outbox
// changed, re-read it" signal. Cross-tab propagation is out of scope — each open tab drives
// its own drain and re-reads on its own online/foreground triggers.

type Listener = () => void;

const listeners = new Set<Listener>();

// Subscribe to outbox changes; returns an unsubscribe. Safe to call with the same listener
// twice (Set-deduped).
export function subscribeOutboxChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Announce that the persisted outbox changed (an enqueue, a syncing/failed transition, a
// delivered removal, or a purge). Each listener re-reads the store; a throwing listener
// never blocks the others.
export function notifyOutboxChange(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A subscriber's re-read should never break the writer that triggered it.
    }
  }
}
