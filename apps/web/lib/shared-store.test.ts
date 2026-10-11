import { test } from "node:test";
import assert from "node:assert/strict";

import { createSharedStore } from "./shared-store.ts";

// `createSharedStore` sits under `useWideViewport` and `useChartTheme`: one watch on the
// browser source, however many charts read it. These tests drive it with a fake source
// that counts reads and watches — no browser required.

interface Colour {
  hex: string;
}

function fakeSource(initial: Colour) {
  let current = initial;
  let notify: (() => void) | null = null;
  const counts = { reads: 0, watches: 0, stops: 0 };
  return {
    counts,
    isWatched: () => notify !== null,
    set(next: Colour) {
      current = next;
      notify?.();
    },
    setSilently(next: Colour) {
      current = next;
    },
    source: {
      read: () => {
        counts.reads += 1;
        return current;
      },
      watch: (onChange: () => void) => {
        counts.watches += 1;
        notify = onChange;
        return () => {
          counts.stops += 1;
          notify = null;
        };
      },
      equals: (a: Colour, b: Colour) => a.hex === b.hex,
    },
  };
}

test("watches the source once however many readers subscribe", () => {
  const fake = fakeSource({ hex: "#000" });
  const store = createSharedStore(fake.source);

  const unsubscribeA = store.subscribe(() => {});
  const unsubscribeB = store.subscribe(() => {});
  const unsubscribeC = store.subscribe(() => {});

  assert.equal(fake.counts.watches, 1);
  unsubscribeA();
  unsubscribeB();
  assert.equal(fake.counts.stops, 0);
  unsubscribeC();
  assert.equal(fake.counts.stops, 1);
  assert.equal(fake.isWatched(), false);
});

test("notifies every reader with the new value on a change", () => {
  const fake = fakeSource({ hex: "#000" });
  const store = createSharedStore(fake.source);
  const seen: string[] = [];
  store.subscribe(() => seen.push(`a:${store.getSnapshot().hex}`));
  store.subscribe(() => seen.push(`b:${store.getSnapshot().hex}`));

  fake.set({ hex: "#fff" });

  assert.deepEqual(seen, ["a:#fff", "b:#fff"]);
});

test("serves the cached snapshot while watched instead of re-reading", () => {
  const fake = fakeSource({ hex: "#000" });
  const store = createSharedStore(fake.source);
  store.subscribe(() => {});
  const readsAfterSubscribe = fake.counts.reads;

  store.getSnapshot();
  store.getSnapshot();

  assert.equal(fake.counts.reads, readsAfterSubscribe);
});

test("keeps the same reference when a re-read is equal", () => {
  const fake = fakeSource({ hex: "#000" });
  const store = createSharedStore(fake.source);
  const first = store.getSnapshot();

  fake.setSilently({ hex: "#000" });

  assert.equal(store.getSnapshot(), first);
});

test("re-reads while unwatched, so a change nobody heard is not served stale", () => {
  const fake = fakeSource({ hex: "#000" });
  const store = createSharedStore(fake.source);
  const unsubscribe = store.subscribe(() => {});
  unsubscribe();

  fake.setSilently({ hex: "#fff" });

  assert.equal(store.getSnapshot().hex, "#fff");
});

test("picks up a change made between the render's read and the first subscribe", () => {
  const fake = fakeSource({ hex: "#000" });
  const store = createSharedStore(fake.source);
  store.getSnapshot();

  fake.setSilently({ hex: "#fff" });
  store.subscribe(() => {});

  assert.equal(store.getSnapshot().hex, "#fff");
});
