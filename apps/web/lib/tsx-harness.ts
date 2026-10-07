import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mock } from "node:test";
import ts from "@typescript/typescript6";
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
// value that is, unavoidably, an untyped module namespace at runtime. A caller that only
// destructures a component and renders it says nothing, and gets the namespace — the one
// place `any` is the truthful element type, since the module's exports are untyped by
// construction.
export function loadTsx<T = Record<string, any>>(
  path: string,
  boundaries: ModuleBoundaries = {},
): T {
  // One module registry per load, so the graph behaves the way Node and the bundler do: a
  // module two importers share is evaluated **once** and they get the same exports. Without
  // it, a module-level singleton — a `createContext` object, most of all — silently becomes
  // one copy per importer, and a provider in one file cannot be read by a consumer in
  // another. Keeping the registry per call rather than global is what keeps two tests (and
  // two sets of `boundaries`) from leaking into each other.
  return loadModule<T>(path, boundaries, new Map());
}

// Several entry modules into **one** registry, for a test that composes a tree by hand out of
// parts that live in different files. Two `loadTsx` calls are two graphs, so a context object
// the parts share would be one object per call and a provider from the first could not be read
// by a consumer from the second — the same failure the registry exists to prevent, just moved
// up to the call site.
export function loadTsxGraph(
  paths: readonly string[],
  boundaries: ModuleBoundaries = {},
): readonly Record<string, any>[] {
  const registry = new Map<string, unknown>();
  return paths.map((path) => loadModule<Record<string, any>>(path, boundaries, registry));
}

function loadModule<T>(
  path: string,
  boundaries: ModuleBoundaries,
  registry: Map<string, unknown>,
): T {
  const loaded = registry.get(path);
  if (loaded !== undefined) return loaded as T;
  const source = ts.transpileModule(readFileSync(resolve(webRoot, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  // Registered before evaluation, as Node does, so an import cycle sees the partially-filled
  // exports object instead of re-entering the module forever.
  registry.set(path, module.exports);
  const localRequire = (name: string): unknown => {
    if (name in boundaries) return boundaries[name];
    const base = name.startsWith("@/")
      ? name.slice("@/".length)
      : name.startsWith(".")
        ? joinFromDirectory(path.slice(0, path.lastIndexOf("/")), name)
        : null;
    // A real package (react, lucide-react, next/link) — hand it to Node.
    if (base === null) return require(name);
    if (base.endsWith(".ts") || base.endsWith(".tsx"))
      return loadModule(base, boundaries, registry);
    const extension = existsSync(resolve(webRoot, `${base}.ts`)) ? ".ts" : ".tsx";
    return loadModule(`${base}${extension}`, boundaries, registry);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  // Re-registered after evaluation: the entry above is the *pre*-evaluation exports object, which
  // is the right thing for a cycle but stale if a module replaced `module.exports` outright.
  registry.set(path, module.exports);
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
