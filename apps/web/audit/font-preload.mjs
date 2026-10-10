// Rendered check for the font preload set (ADR-0050, amended).
//
// `lib/font-preload-policy.ts` proves what `app/layout.tsx` *declares*. This journey proves
// what a running app *emits*: it loads the signed-out shell from a production `next start`
// and collects every font preload hint, from the `Link` response header and from
// `<link rel="preload" as="font">` in the DOM after load. It then maps each hinted file back
// to its `--font-*` handle through the served stylesheets' @font-face and next/font variable
// rules, and gates on:
//
//   1. every preloaded file belongs to a default-Skin family, and
//   2. every default-Skin family has at least one preloaded file.
//
// The root layout carries the preloads, so the public "/" route stands in for every route.
// Run it against a production build (see the CI Lighthouse job for placeholder Clerk keys:
// a `pk_test_` key redirects the first browser navigation to a handshake that dead-ends):
//
//   npm run build && npm run start   # then, in another shell:
//   node audit/font-preload.mjs
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { skinFontHandles } from "../lib/font-preload-policy.ts";
import { DEFAULT_SKIN } from "../lib/theme.ts";

const BASE = process.env.UI_AUDIT_BASE ?? "http://127.0.0.1:3000";
const OUTPUT = resolve(process.env.UI_FONT_OUTPUT ?? "../../docs/development/font-preload-evidence");

function executablePath() {
  const installed = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {
    /* resolver itself can throw when the pinned build is absent */
  }
  return existsSync(installed) ? installed : undefined;
}

const fileName = (url) => new URL(url, BASE).pathname.split("/").pop();

// `</a.woff2>; rel=preload; as="font", </b.woff2>; …` → font file names.
function linkHeaderFonts(header) {
  return [...(header ?? "").matchAll(/<([^>]+)>;([^,]*)/g)]
    .filter(([, , params]) => /rel=preload/.test(params) && /as="?font/.test(params))
    .map(([, url]) => fileName(url));
}

// Handle → the font files its family's @font-face rules serve. next/font writes
// `--font-x: "Family", "Family Fallback"` on its variable class, and `@font-face {
// font-family: Family; src: url(…) }` per subset.
function filesByHandle(cssTexts) {
  const css = cssTexts.join("\n");
  const familyByHandle = new Map([...css.matchAll(/(--font-[\w-]+):\s*["']([^"']+)["']/g)]
    .map(([, handle, family]) => [handle, family]));
  const filesByFamily = new Map();
  for (const [face] of css.matchAll(/@font-face\s*\{[^}]+\}/g)) {
    const family = face.match(/font-family:\s*["']?([^;"'}]+)["']?/)?.[1].trim();
    const files = [...face.matchAll(/url\(["']?([^)"']+)["']?\)/g)].map(([, url]) => fileName(url));
    filesByFamily.set(family, [...(filesByFamily.get(family) ?? []), ...files]);
  }
  return new Map([...familyByHandle].map(([handle, family]) =>
    [handle, filesByFamily.get(family) ?? []]));
}

const browser = await chromium.launch({ executablePath: executablePath() });
const page = await browser.newPage();
const response = await page.goto(`${BASE}/`, { waitUntil: "load" });
if (response?.status() !== 200) throw new Error(`GET / returned ${response?.status()}`);

const domFonts = await page.$$eval('link[rel="preload"][as="font"]', (links) =>
  links.map((link) => link.href));
const cssTexts = await page.evaluate(async () => Promise.all(
  [...document.querySelectorAll('link[rel="stylesheet"]')].map(async (link) =>
    (await fetch(link.href)).text())));
await browser.close();

const preloaded = [...new Set([
  ...linkHeaderFonts(response.headers().link),
  ...domFonts.map(fileName),
])].sort();
const handles = filesByHandle(cssTexts);
const handleOf = (file) => [...handles].find(([, files]) => files.includes(file))?.[0] ?? null;

const globalsCss = await readFile(resolve(import.meta.dirname, "../app/globals.css"), "utf8");
const defaultHandles = skinFontHandles(globalsCss, DEFAULT_SKIN);
const failures = [
  ...preloaded.filter((file) => !defaultHandles.has(handleOf(file)))
    .map((file) => `${file} (${handleOf(file) ?? "unknown family"}) is preloaded but is not a ` +
      `${DEFAULT_SKIN} font`),
  ...[...defaultHandles].filter((handle) => !preloaded.some((file) => handleOf(file) === handle))
    .map((handle) => `${handle} is a ${DEFAULT_SKIN} font but nothing preloads it`),
];

const summary = {
  route: "/",
  defaultSkin: DEFAULT_SKIN,
  defaultHandles: [...defaultHandles],
  preloaded: preloaded.map((file) => ({ file, handle: handleOf(file) })),
  failures,
};
await mkdir(OUTPUT, { recursive: true });
await writeFile(resolve(OUTPUT, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) process.exit(1);
