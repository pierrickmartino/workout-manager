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
