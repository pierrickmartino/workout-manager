import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";

// Render real TSX with the existing offline `node --test` runner, without a browser and
// without a build: transpile the file, then satisfy its `@/` imports by transpiling those
// too. `boundaries` replaces a module by specifier, which is how a test holds a Server
// Action, a router or `next/navigation` still while the component under test renders.
//
// Shared rather than copied: two walks of the same import graph would drift, and a test
// that quietly resolved a different `@/components/ui/input` than its neighbour would report
// a primitive's default as present when it is not.

const require = createRequire(import.meta.url);

// The module's own exports are untyped by construction — the caller names what it expects
// by destructuring — so this is the one place `any` is the honest return type.
export function importComponent(
  path: string,
  boundaries: Record<string, unknown> = {},
): any {
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
    return importComponent(`${base}${extension}`, boundaries);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}
