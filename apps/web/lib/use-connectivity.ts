"use client";

import { useSyncExternalStore } from "react";

// The connectivity read (issue #414). The whole sync-state *decision* lives in the pure
// `deriveSyncState` seam (lib/sync-state, unit-tested); this shell is the ONLY place raw
// `navigator.onLine` and the `online`/`offline` events are touched, mirroring how
// `useWakeLock` is the only place `navigator.wakeLock` is touched. It stays a thin,
// deliberately uncovered effect.
//
// `useSyncExternalStore` is exactly right here: the browser's connectivity is an external
// store with a subscribe (the events) and a snapshot (`navigator.onLine`). The server
// snapshot is `true` (optimistic — SSR has no connectivity signal and must not flash an
// offline banner during hydration), so the first client render reconciles to the real
// value.

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// `navigator.onLine` is a best-effort signal (a true value only means a network interface
// is up, not that the server is reachable), which is why real delivery failures are still
// caught by the outbox drain and surfaced as `failed`. Reading it can throw in exotic
// contexts, so it is guarded to the optimistic default.
function getSnapshot(): boolean {
  try {
    return navigator.onLine;
  } catch {
    return true;
  }
}

// SSR / first paint: assume online so no offline banner flashes before hydration.
function getServerSnapshot(): boolean {
  return true;
}

// True while the browser reports a live network connection; re-renders the caller on every
// `online`/`offline` transition.
export function useConnectivity(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
