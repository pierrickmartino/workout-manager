import { readdirSync } from "node:fs";
import { resolve } from "node:path";

// The whole-web-root file list the static guards sweep, shared by the three that have nothing
// to carve out: `icon-import-policy` (ADR-0092), `native-dialog-policy` (ADR-0098) and
// `context-api-policy` (ADR-0110). Each had its own byte-identical copy of this walk and of
// the three assertions proving the walk found anything; the third copy is where that stopped
// being a coincidence.
//
// What is *swept* stays each guard's own decision and each guard's own comment — the chart
// guards (ADR-0084, ADR-0090) deliberately exclude `audit/`, which must import a chart
// statically to mount it, and so do not use this. This module only holds the walk they agree
// on, and `swept-web-sources.test.ts` holds the one claim they each used to make separately:
// that it reaches the web root rather than silently matching nothing, which is the way a
// clean sweep lies.

// Every source extension, because a rule about what source may name holds wherever it is
// written — a `.mjs` audit harness and a `scripts/` one-off included.
export const WEB_SOURCE_EXTENSIONS: readonly string[] = [
  ".ts",
  ".tsx",
  ".mts",
  ".mjs",
  ".js",
  ".jsx",
];

// Not source we wrote: installed packages, build output, and static files served as-is.
export const UNSWEPT_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  ".next",
  "public",
]);

const webRoot = resolve(import.meta.dirname, "..");

// Every source file under `apps/web`, as paths relative to the web root with forward slashes
// (so a finding reads the same on Windows as in CI).
export function sweptWebSources(): readonly string[] {
  return readdirSync(webRoot, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.split("\\").join("/"))
    .filter((entry) => !entry.split("/").some((part) => UNSWEPT_DIRECTORIES.has(part)))
    .filter((entry) => WEB_SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension)));
}

// The absolute path of a swept entry, for the guard that has to read it.
export function sweptWebSourcePath(entry: string): string {
  return resolve(webRoot, entry);
}
