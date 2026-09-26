import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import React from "react";
import { JSDOM } from "jsdom";
import * as storage from "./form-draft-storage.ts";

const require = createRequire(import.meta.url);
function load(path: string, boundaries: Record<string, unknown>): any {
  const filename = resolve(import.meta.dirname, "..", path);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name: string): any => {
    if (name in boundaries) return boundaries[name];
    if (!name.startsWith("@/")) return require(name);
    const base = name.slice(2);
    const extension = existsSync(resolve(import.meta.dirname, "..", `${base}.ts`)) ? ".ts" : ".tsx";
    return load(`${base}${extension}`, boundaries);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}
const validate = (value: unknown): value is { reps: string } =>
  typeof value === "object" && value !== null && typeof (value as { reps?: unknown }).reps === "string";

test("mounted drafts restore explicitly, warn on failed writes, retry, and stop after save or sign-out", async () => {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let account = "user_1";
  let draftId = "correction:7";
  let result: any;
  let change: (value: string) => void;
  let blocked = false;
  const local = dom.window.localStorage;
  Object.defineProperty(dom.window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => local.getItem(key),
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error("QuotaExceededError");
      local.setItem(key, value);
    },
    removeItem: (key: string) => local.removeItem(key),
  } });
  const { useFormDraft } = load("lib/use-form-draft.ts", {
    "@clerk/nextjs": { useAuth: () => ({ userId: account, isLoaded: true }) },
    "./form-draft-storage": storage,
  });
  const { FormDraftRecovery } = load("components/FormDraftRecovery.tsx", {});
  function Form() {
    const [data, setData] = React.useState({ reps: "default" });
    const [dirty, setDirty] = React.useState(false);
    change = (reps) => { setData({ reps }); setDirty(true); };
    const restore = React.useCallback((restored: { reps: string }) => { setData(restored); setDirty(true); }, []);
    result = useFormDraft({ draftId, data, isDirty: dirty, validate, onRestore: restore });
    return React.createElement("div", null, React.createElement("output", null, data.reps),
      React.createElement(FormDraftRecovery, result));
  }
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const render = () => root.render(React.createElement(Form));
  const read = () => storage.readBrowserFormDraft<{ reps: string }>(account, draftId);
  try {
    storage.writeBrowserFormDraft(account, draftId, { reps: "8" });
    await React.act(async () => render());
    assert.equal(document.querySelector("output")!.textContent, "default", "recovery requires a choice");
    await React.act(async () => result.recovery.restore());
    assert.equal(document.querySelector("output")!.textContent, "8");
    await React.act(async () => change("9"));
    assert.equal(read()!.data.reps, "9", "the draft remains until a save is acknowledged");
    blocked = true;
    await React.act(async () => change("10"));
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /could not be saved/);
    assert.equal(document.querySelector("output")!.textContent, "10", "storage failure does not block editing");
    assert.equal(read()!.data.reps, "9", "failed writes preserve the last durable draft");
    Object.defineProperty(dom.window, "localStorage", {
      configurable: true,
      get: () => { throw new Error("SecurityError"); },
    });
    await React.act(async () => change("10 while storage is disabled"));
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /could not be saved/);
    Object.defineProperty(dom.window, "localStorage", { configurable: true, value: local });
    blocked = false;
    await React.act(async () => change("11"));
    assert.equal(document.querySelector('[role="alert"]'), null);
    assert.equal(read()!.data.reps, "11");
    await React.act(async () => result.clearAfterSave());
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    assert.equal(read(), null, "acknowledgement clears and disables lifecycle rewrites");

    storage.writeBrowserFormDraft("user_1", "correction:8", { reps: "other record" });
    account = "user_2";
    await React.act(async () => render());
    assert.equal(result.recovery, null, "another account cannot see recovery");
    account = "user_1";
    draftId = "correction:8";
    await React.act(async () => render());
    assert.ok(result.recovery, "only the matching account and record gets recovery");
    await React.act(async () => result.recovery.discard());
    await React.act(async () => change("12"));
    assert.equal(read()!.data.reps, "12");
    await React.act(async () => storage.clearBrowserFormDrafts());
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    await React.act(async () => change("13"));
    assert.equal(read(), null, "a mounted form cannot recreate purged sign-out data");
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const key of ["window", "document", "Event", "IS_REACT_ACT_ENVIRONMENT"]) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
