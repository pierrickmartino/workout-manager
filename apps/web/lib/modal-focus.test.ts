import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
function load(path = "./use-modal-focus.ts", boundaries: Record<string, unknown> = {}): any {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name: string): any => {
    if (name in boundaries) return boundaries[name];
    if (!name.startsWith("@/")) return require(name);
    const base = `../${name.slice(2)}`;
    return load(`${base}${existsSync(new URL(`${base}.ts`, import.meta.url)) ? ".ts" : ".tsx"}`, boundaries);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}

test("mounted modal isolates background, contains focus and restores its opener", async () => {
  const dom = new JSDOM("<body><main><button id='opener'>Open</button><div id='root'></div></main><nav><button>Navigate</button></nav></body>");
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const { createRoot } = await import("react-dom/client");
  const { useModalFocus } = load();
  let closes = 0;
  function Modal({ open }: { open: boolean }) {
    const ref = React.useRef<HTMLDivElement>(null);
    useModalFocus(ref, open, () => closes++);
    return React.createElement("div", { ref, role: "dialog", tabIndex: -1 },
      React.createElement("button", { id: "first" }, "Close"),
      React.createElement("button", { disabled: true }, "Disabled"),
      React.createElement("button", { id: "last" }, "More"));
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    const opener = document.getElementById("opener")!;
    opener.focus();
    await React.act(async () => root.render(React.createElement(Modal, { open: true })));
    const dialog = document.querySelector('[role="dialog"]')!;
    assert.equal(document.activeElement, dialog);
    assert.ok(opener.hasAttribute("inert"));
    assert.ok(document.querySelector("nav")!.hasAttribute("inert"));
    assert.equal(document.body.style.overflow, "hidden");
    const first = document.getElementById("first")!;
    const last = document.getElementById("last")!;
    last.focus();
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, first);
    first.focus();
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, last);
    opener.focus();
    assert.equal(document.activeElement, dialog);
    await React.act(async () => root.render(React.createElement(Modal, { open: true })));
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(closes, 1);
    await React.act(async () => root.render(React.createElement(Modal, { open: false })));
    assert.equal(document.activeElement, opener);
    assert.ok(!opener.hasAttribute("inert"));
    assert.ok(!document.querySelector("nav")!.hasAttribute("inert"));
    assert.equal(document.body.style.overflow, "");
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("catalog drawer cancels a delayed close when another Exercise opens and ignores superseded filter responses", async () => {
  const dom = new JSDOM("<body><button id='outside'>Navigation</button><div id='root'></div></body>", { url: "http://localhost/exercises", pretendToBeVisual: true });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  dom.window.matchMedia = () => ({ matches: false }) as MediaQueryList;
  const { createRoot } = await import("react-dom/client");
  const requests: { resolve: (value: any) => void }[] = [];
  const { ExerciseCatalogTaxonomy } = load("../components/ExerciseCatalogTaxonomy.tsx", {
    "@/app/exercises/actions": { fetchCatalogTaxonomyForFilters: () => new Promise((resolve) => requests.push({ resolve })) },
    "@/lib/use-connectivity": { useConnectivity: () => true },
    "@/components/exercise/catalog-detail": { CatalogDetail: ({ exercise }: any) => React.createElement("p", null, exercise.name) },
  });
  const exercise = (id: number, name: string) => ({ id, name, targeted_muscles: [], required_equipment: [], difficulty: null, provenance: "curated", movement_pattern: "squat", equipment: [] });
  const taxonomy = { total: 2, groups: [{ pattern: "squat", count: 2, exercises: [exercise(1, "Squat A"), exercise(2, "Squat B")] }] };
  const root = createRoot(document.getElementById("root")!);
  const wait = () => new Promise((resolve) => setTimeout(resolve, 340));
  try {
    await React.act(async () => root.render(React.createElement(ExerciseCatalogTaxonomy, {
      initialFilters: { query: "", muscleGroups: [], equipment: [], difficulty: [] }, initialTaxonomy: taxonomy,
      equipmentOptions: [], myEquipment: [], usage: [], referenceIso: "2026-09-26", unit: "kg",
    })));
    const row = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("li button")).find((button) => button.textContent!.includes(name))!;
    const opener = row("Squat A");
    opener.focus();
    await React.act(async () => opener.click());
    assert.equal(document.querySelector('[role="dialog"]')!.getAttribute("aria-label"), "Squat A");
    assert.ok(document.getElementById("outside")!.hasAttribute("inert"));
    await React.act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close details"]')!.click());
    await React.act(async () => row("Squat B").click());
    await React.act(wait);
    assert.equal(document.querySelector('[role="dialog"]')!.getAttribute("aria-label"), "Squat B");
    await React.act(async () => document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await React.act(wait);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, opener);
    assert.ok(!document.getElementById("outside")!.hasAttribute("inert"));
    const facet = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === label)!;
    await React.act(async () => facet("Legs").click());
    await React.act(wait);
    assert.equal(requests.length, 1);
    await React.act(async () => facet("Chest").click());
    // Invalidate immediately, before the new filter's debounce fires.
    await React.act(async () => requests[0].resolve({ taxonomy: { total: 99, groups: [] }, error: "Stale error" }));
    assert.doesNotMatch(document.body.textContent!, /Stale error|99 EXERCISES/);
    await React.act(wait);
    assert.equal(requests.length, 2);
    await React.act(async () => requests[1].resolve({ taxonomy: { total: 7, groups: [] }, error: null }));
    assert.match(document.body.textContent!, /7 EXERCISES/);
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("confirmation and atlas drawers restore HTML and SVG openers after their explicit close controls", async () => {
  const dom = new JSDOM("<body><button id='opener'>Leave</button><svg><g id='muscle' tabindex='0'></g></svg><div id='root'></div></body>", { pretendToBeVisual: true });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const { createRoot } = await import("react-dom/client");
  const { ConfirmDialog } = load("../components/pulse/confirm-dialog.tsx");
  const { AtlasDrawer } = load("../components/analytics/atlas-drawer.tsx");
  const root = createRoot(document.getElementById("root")!);
  let cancelled = false;
  let closed = false;
  try {
    const opener = document.getElementById("opener")!;
    opener.focus();
    await React.act(async () => root.render(React.createElement(ConfirmDialog, {
      title: "Leave this draft?", message: "Unsaved draft", confirmLabel: "Leave", cancelLabel: "Stay",
      onConfirm: () => {}, onCancel: () => { cancelled = true; },
    })));
    const stay = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent === "Stay")!;
    stay.focus();
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", cancelable: true, bubbles: true }));
    assert.equal(document.activeElement!.textContent, "Leave");
    await React.act(async () => stay.click());
    assert.ok(cancelled);
    await React.act(async () => root.render(null));
    assert.equal(document.activeElement, opener);
    const muscle = document.getElementById("muscle") as unknown as SVGElement;
    muscle.focus();
    const props = { weeksLabel: "last four weeks", onClose: () => { closed = true; } };
    await React.act(async () => root.render(React.createElement(AtlasDrawer, { ...props, region: {
      muscle: "Quadriceps", group: "Legs", covered: false, stateLabel: "Not trained", sets: 0, contributingExercises: [],
    } })));
    const close = document.querySelector<HTMLButtonElement>('[role="dialog"] button')!;
    assert.equal(close.textContent, "Close details");
    await React.act(async () => close.click());
    assert.ok(closed);
    await React.act(async () => root.render(React.createElement(AtlasDrawer, { ...props, region: null })));
    assert.equal(document.activeElement, muscle);
    assert.ok(document.querySelector('[role="dialog"]')!.hasAttribute("inert"));
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
