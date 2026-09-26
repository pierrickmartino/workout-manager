import { test } from "node:test";
import assert from "node:assert/strict";

import { createLatestCatalogRequest } from "./latest-catalog-request.ts";

interface CatalogResponse {
  taxonomy: string;
  error: string | null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("a superseded catalog response cannot replace the latest results or error", async () => {
  const requests = createLatestCatalogRequest();
  const requestA = deferred<CatalogResponse>();
  const requestB = deferred<CatalogResponse>();
  let displayed = { taxonomy: "initial", error: null as string | null };

  const pendingA = requests.begin("query=a").run(() => requestA.promise, (result) => {
    displayed = result;
  });
  requests.invalidate();
  const pendingB = requests.begin("query=b").run(() => requestB.promise, (result) => {
    displayed = result;
  });

  requestB.resolve({ taxonomy: "results B", error: "error B" });
  await pendingB;
  requestA.resolve({ taxonomy: "results A", error: "error A" });
  await pendingA;

  assert.deepEqual(displayed, { taxonomy: "results B", error: "error B" });
});

test("a newer request for the same filters wins and cancelled requests cannot publish", async () => {
  const requests = createLatestCatalogRequest();
  const first = deferred<CatalogResponse>();
  const second = deferred<CatalogResponse>();
  let displayed = { taxonomy: "initial", error: null as string | null };
  const older = requests.begin("query=squat");
  const pendingOlder = older.run(() => first.promise, (result) => { displayed = result; });
  const newer = requests.begin("query=squat");
  const pendingNewer = newer.run(() => second.promise, (result) => { displayed = result; });
  second.resolve({ taxonomy: "newest", error: null });
  await pendingNewer;
  first.resolve({ taxonomy: "older", error: "stale" });
  await pendingOlder;
  assert.deepEqual(displayed, { taxonomy: "newest", error: null });
  const cancelled = requests.begin("query=bench");
  const delayed = deferred<CatalogResponse>();
  const pending = cancelled.run(() => delayed.promise, (result) => { displayed = result; });
  cancelled.cancel();
  delayed.resolve({ taxonomy: "cancelled", error: "cancelled" });
  await pending;
  assert.deepEqual(displayed, { taxonomy: "newest", error: null });
});
