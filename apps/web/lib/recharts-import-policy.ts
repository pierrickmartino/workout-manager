import { moduleSpecifiers } from "./module-specifiers.ts";

// ADR-0090, and the bundle budget ADR-0088 sets, made executable. Recharts costs ~102 KB
// gzipped in a route's client chunk graph — against that ~10 KB budget — and a *static*
// import puts it there whether or not the component ever renders. `volume-chart-wide.tsx`
// paid for that lesson once with a measurement (#576 review), and three other routes were
// paying it again; this guard is what stops it being paid a third time.
//
// The rule: a module that imports `recharts` may be reached only through `next/dynamic`. A
// `dynamic(() => import("./chart"))` is a call expression, so it passes here by construction;
// a plain `import { Chart } from "./chart"` at the top of a page or panel does not. That is a
// source property — which file names which module in an import declaration — so this module
// reads source, like `chart-values-policy` and `motion-policy` before it.
//
// Given one file's text it returns the violations that file declares; walking the tree and
// deciding which modules draw plots is the caller's job (see recharts-import-policy.test.ts),
// which keeps this module pure.
//
// **What this guard proves, and what it does not.** It proves no product module statically
// names a plot module. It cannot prove the resulting chunk is under budget — that is a build
// property, and measuring `.next/server/app/<route>/page_client-reference-manifest.js` is
// still the procedure CLAUDE.md prescribes. A green run here is not a measurement.
//
// It does not fail closed on an unknown `recharts` export, because it does not need to: any
// import from `recharts` at all makes a module a plot module, whatever it names.

// A type-only import is erased before the bundler sees it, so it costs no bytes: `import
// type { TopSetTrendRow }` from a chart module is a shape reference, not a dependency, and
// is exempt by rule rather than by registry.

export interface RechartsImportExemption {
  readonly file: string;
  readonly imported: string;
  readonly reason: string;
}

// Deliberately empty. An entry here asserts that a route may carry ~102 KB gzipped of
// charting library it might never draw with, which needs a reason a reviewer can weigh —
// so the reason is a required field, not a comment.
export const RECHARTS_IMPORT_EXEMPTIONS: readonly RechartsImportExemption[] = [];

export interface RechartsImportViolation {
  readonly file: string;
  readonly line: number;
  // The plot module named, as a repo-relative path.
  readonly imported: string;
}

export interface ModuleImport {
  readonly specifier: string;
  readonly line: number;
  readonly isTypeOnly: boolean;
}

// Every static `import … from "…"` in this file. The shared `moduleSpecifiers` walk reads
// the AST rather than the bytes, so a module path inside a comment, a string, or a
// `dynamic(() => import(…))` callback never counts — the last of those being the whole
// point. A re-export is dropped here: this rule is about what a *route* pulls into its chunk
// graph, and a barrel re-exporting a chart is itself a plot module, caught as one.
export function staticImports(source: string, file: string): readonly ModuleImport[] {
  return moduleSpecifiers(source, file).filter(({ isReExport }) => !isReExport);
}

// Whether this file imports `recharts` — which is what makes it a plot module, and so a
// module no product surface may name statically.
export function importsRecharts(source: string, file: string): boolean {
  return staticImports(source, file).some(({ specifier }) => specifier === "recharts");
}

// A module specifier as written, resolved to the repo-relative paths it could name. `@/` is
// the web root (see tsconfig `paths`); a relative specifier resolves against the importing
// file's directory. Returns candidates rather than hitting the filesystem so the rule stays
// a pure function of source — the caller already knows which files exist.
export function resolveSpecifier(specifier: string, fromFile: string): readonly string[] {
  const base = specifier.startsWith("@/")
    ? specifier.slice("@/".length)
    : specifier.startsWith(".")
      ? joinPath(dirname(fromFile), specifier)
      : null;
  if (base === null) return [];
  return [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`];
}

function dirname(file: string): string {
  const cut = file.lastIndexOf("/");
  return cut === -1 ? "" : file.slice(0, cut);
}

// Resolves `.` and `..` segments against a directory, so `components/exercise` +
// `../pulse/volume-chart` reads as `components/pulse/volume-chart`.
function joinPath(directory: string, relative: string): string {
  const segments = directory === "" ? [] : directory.split("/");
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

export function findRechartsImportViolations(
  source: string,
  file: string,
  plotModules: ReadonlySet<string>,
): readonly RechartsImportViolation[] {
  // A plot module naming itself, or another plot module, is not the failure this rule is
  // about: it is already behind whatever gate its own importers set up.
  if (plotModules.has(file)) return [];

  const violations: RechartsImportViolation[] = [];
  for (const { specifier, line, isTypeOnly } of staticImports(source, file)) {
    if (isTypeOnly) continue;
    const imported = resolveSpecifier(specifier, file).find((candidate) =>
      plotModules.has(candidate));
    if (imported === undefined) continue;
    violations.push({ file, line, imported });
  }
  return violations.filter((violation) => !RECHARTS_IMPORT_EXEMPTIONS.some((exemption) =>
    exemption.file === violation.file && exemption.imported === violation.imported));
}

export function formatRechartsImportViolations(
  violations: readonly RechartsImportViolation[],
): string {
  return violations.map(({ file, line, imported }) =>
    `${file}:${line} — ${imported} imports recharts, so a static import puts ~102 KB ` +
    "gzipped in this route's client chunk graph whether the chart renders or not; reach it " +
    "through a next/dynamic wrapper instead, or make this an `import type` if you only need " +
    "its row shape (ADR-0090)").join("\n");
}
