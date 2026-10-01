import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mock } from "node:test";
import ts from "typescript";
import { JSDOM } from "jsdom";

// The offline harness for the handful of tests that must render real TSX: no browser, no
// build, no dev server — `node --test` transpiles the component and mounts it into JSDOM.
//
// Most frontend logic in this repo lives in `lib/` view-models precisely so it needs none of
// this. The tests that do need it are the ones whose subject *is* a React behaviour — that a
// tick reaches only the leaf that displays it (ADR-0091), that a memo boundary is not
// defeated by a fresh handler, that a form follows a prop it is re-rendered with. Those
// cannot be asserted against a view-model, so they get a real mount.
//
// This module exists because that harness was copy-pasted per test file, and three copies of
// a module loader is drift waiting to happen: `catalog-list-memo` needed relative-specifier
// resolution that its siblings lacked, which is exactly the kind of divergence nobody
// notices until a test fails for a reason that has nothing to do with its subject.
//
// Not itself a `*.test.ts`, so the runner does not collect it; it is exercised by every test
// that imports it.

const require = createRequire(import.meta.url);
const webRoot = resolve(import.meta.dirname, "..");

// Modules to hand the loaded component instead of loading them: server actions, Clerk,
// `next/navigation` — anything whose real implementation needs I/O or a Next runtime. Keyed
// by the specifier exactly as the source writes it.
export type ModuleBoundaries = Readonly<Record<string, unknown>>;

// Transpile and evaluate a `.ts`/`.tsx` module and its whole `@/`- and relative-import
// graph, substituting `boundaries` at the edges. `path` is web-root-relative
// ("components/pulse/elapsed-clock.tsx").
//
// The caller names the exports it expects via `T`, which is how this stays honest about a
// value that is, unavoidably, an untyped module namespace at runtime.
export function loadTsx<T>(path: string, boundaries: ModuleBoundaries = {}): T {
  const source = ts.transpileModule(readFileSync(resolve(webRoot, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name: string): unknown => {
    if (name in boundaries) return boundaries[name];
    const base = name.startsWith("@/")
      ? name.slice("@/".length)
      : name.startsWith(".")
        ? joinFromDirectory(path.slice(0, path.lastIndexOf("/")), name)
        : null;
    // A real package (react, lucide-react, next/link) — hand it to Node.
    if (base === null) return require(name);
    if (base.endsWith(".ts") || base.endsWith(".tsx")) return loadTsx(base, boundaries);
    const extension = existsSync(resolve(webRoot, `${base}.ts`)) ? ".ts" : ".tsx";
    return loadTsx(`${base}${extension}`, boundaries);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports as T;
}

// Resolves `.` and `..` against the importing module's directory, so `components/exercise` +
// `./movement-glyph` reads as `components/exercise/movement-glyph`.
function joinFromDirectory(directory: string, relative: string): string {
  const segments = directory === "" ? [] : directory.split("/");
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

export interface MountOptions {
  // The document URL, for the tests that read `window.location`.
  readonly url?: string;
  // Freeze the clock at 0 and put `setInterval` under `mock.timers`, so a tick-driven
  // assertion reads an exact timer face instead of racing real time.
  readonly timers?: boolean;
}

export interface MountedDom {
  readonly dom: JSDOM;
  readonly restore: () => void;
}

// Install a JSDOM window, the globals React's DOM renderer and the components reach for, and
// the act environment. Returns the teardown, which every caller runs from a `finally` —
// these are process globals, so a test that leaks them breaks the next one.
export function mountDom({ url = "http://localhost", timers = false }: MountOptions = {}): MountedDom {
  const dom = new JSDOM("<!doctype html><div id='root'></div>", { url });
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    Event: dom.window.Event,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    // Node ships its own `FormData` (undici's), which rejects an HTMLFormElement and throws
    // inside the event handler that built it — a form action then silently does nothing.
    // JSDOM's is the one a form and React DOM both mean.
    FormData: dom.window.FormData,
    // JSDOM implements these on its window, not on `globalThis`, and a component calls them
    // bare. A `setTimeout` stand-in is enough: no test here asserts frame timing.
    requestAnimationFrame: (callback: () => void) => dom.window.setTimeout(callback, 0),
    cancelAnimationFrame: (handle: number) => dom.window.clearTimeout(handle),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  if (timers) mock.timers.enable({ apis: ["setInterval", "Date"] });
  return {
    dom,
    restore: () => {
      if (timers) mock.timers.reset();
      dom.window.close();
      for (const key of Object.keys(globals)) {
        if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

// Set a value on a React-controlled field and fire the event `onChange` listens for.
// Assigning `element.value` alone is not enough: React installs its own value setter to
// dedupe events, so the write has to go through the prototype's setter first.
export function setFieldValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype =
    element.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
}
