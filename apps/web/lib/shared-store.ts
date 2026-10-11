// A browser value read through one shared subscription, for `useSyncExternalStore`
// (`client-event-listeners`). However many components read it, the source is watched
// once: the first subscriber starts the watch and the last one stops it.
//
// While watched, the snapshot is cached and refreshed only on a change. Unwatched (a
// render before the first subscribe), every read goes to the source, so a value that
// changed while nobody listened is never served stale. A re-read equal to the cached
// value keeps the cached reference, because `useSyncExternalStore` compares snapshots
// with `Object.is` and a fresh but equal object would re-render every reader.

export interface SharedStoreSource<T> {
  // Reads the current value from the source.
  read: () => T;
  // Starts watching the source, calling `onChange` on each change; returns the stop.
  watch: (onChange: () => void) => () => void;
  // Whether two reads hold the same value. Defaults to `Object.is`.
  equals?: (a: T, b: T) => boolean;
}

export interface SharedStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
}

export function createSharedStore<T>({
  read,
  watch,
  equals = Object.is,
}: SharedStoreSource<T>): SharedStore<T> {
  const listeners = new Set<() => void>();
  let snapshot: { value: T } | null = null;
  let stopWatching: (() => void) | null = null;

  const refresh = () => {
    const value = read();
    if (snapshot === null || !equals(snapshot.value, value)) {
      snapshot = { value };
    }
    return snapshot.value;
  };

  const onChange = () => {
    refresh();
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (stopWatching === null) {
        // Catch a change made between the render's read and this subscribe.
        refresh();
        stopWatching = watch(onChange);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stopWatching !== null) {
          stopWatching();
          stopWatching = null;
        }
      };
    },
    getSnapshot() {
      return stopWatching !== null && snapshot !== null
        ? snapshot.value
        : refresh();
    },
  };
}
