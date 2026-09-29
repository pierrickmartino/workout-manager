// Wide-viewport shell sweep (ADR-0088).
//
// `reflow.mjs` renders every journey at 320×568 and gates on document overflow. Nothing in
// this repo has ever looked *above* 416px, because until ADR-0088 there was nothing above
// 416px to look at: `--spacing-shell` was the only width the app had. This runner is its
// mirror — the same `audit/main.tsx` journeys against the same `audit/fixtures.ts` names, at
// 1440×900 — so the two sets of numbers describe one fixture set rather than two.
//
// What it gates on, which is the failure mode this change actually has:
//
//   1. **Document overflow**, the same measure as the narrow sweep. A 72rem frame in a 1440px
//      viewport should never widen the document; if it does, something is ignoring the cap.
//   2. **The frame honours its cap.** <main>'s content box must not exceed `--spacing-shell-wide`.
//   3. **An unconverted page's content column is still narrow.** A page that has not opted in
//      with `data-shell="wide"` must render its content inside `--spacing-shell`; one that has
//      is allowed the frame. A route that stretches by accident is exactly what the per-route
//      opt-in exists to prevent, and it is invisible to every other check in the repo.
//
// What it records without gating: any element whose right edge passes the viewport, matching
// `reflow.mjs`'s predicate so both reports mean the same thing.
//
// Chromium only, for the same container reason as the narrow sweep.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";

const BASE = process.env.UI_AUDIT_BASE ?? "http://127.0.0.1:4173";
const OUTPUT = resolve(process.env.UI_AUDIT_OUTPUT ?? "../../docs/development/ui-wide-evidence");
// A common laptop/desktop viewport, comfortably past the 64rem (1024px) `lg:` threshold so the
// wide frame is the one under test rather than the breakpoint's own edge.
const VIEWPORT = { width: 1440, height: 900 };

// Both shell widths, in px at the default 16px root. Read from the stylesheet at runtime
// rather than hardcoded, so retuning a token cannot leave this runner asserting the old value.
const SHELL_TOKENS = { narrow: "--spacing-shell", wide: "--spacing-shell-wide" };

const SKINS = ["pulse", "aurora", "vercel", "alpine", "clay", "track"];
const MODES = ["light", "dark"];
const FIXTURES = ["short", "session-spaced", "session-unbroken", "exercise-spaced", "exercise-unbroken"];
const ALL_JOURNEYS = [
  "profile", "sessions", "history", "catalog", "creation",
  "logging", "live", "analytics", "correction", "creation-logged",
  // The first page converted to the wide content column (ADR-0088). It is the only journey
  // that opts in with `data-shell="wide"`, so it is the only one exercising the wide column
  // rather than just the wide frame — and the only one whose `columnOverNarrow` gate is
  // expected to be inapplicable rather than merely satisfied.
  "home",
];
// A comma-separated subset, for iterating on one screen without paying for the full sweep.
// The gated run is the unfiltered one.
const JOURNEYS = process.env.UI_WIDE_JOURNEYS
  ? process.env.UI_WIDE_JOURNEYS.split(",").map(name => name.trim()).filter(Boolean)
  : ALL_JOURNEYS;

// The repo pins a Playwright whose Chromium build this container does not carry, so the
// bundled resolver fails. Prefer whatever Playwright resolves; fall back to the installed
// browser rather than downloading one. (Same shim as `reflow.mjs`.)
function executablePath() {
  const installed = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {
    /* resolver itself can throw when the pinned build is absent */
  }
  if (existsSync(installed)) return installed;
  return undefined;
}

// Runs in the page. `main`'s own content box is the frame; the element carrying
// `data-journey` is the page's root, and its content box is the column. The harness mounts
// the journey directly under <main>, so the column is <main>'s first element child.
function measure(tokens) {
  const descriptor = el =>
    `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${String(el.getAttribute("class") ?? "").split(/\s+/).slice(0, 5).join(".")}`;

  // The tokens are authored in `rem`, so reading the custom property gives "72rem" and
  // `parseFloat` would give 72 — a comparison every case passes or every case fails. Resolve
  // each one the way the browser does, by letting it lay a probe out at that width. The probe
  // is absolutely positioned and removed before anything else is measured, so it cannot
  // perturb the very widths this runner exists to record.
  const shell = (() => {
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.top = "0";
    probe.style.left = "0";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const px = name => {
      probe.style.width = `var(${name})`;
      return parseFloat(getComputedStyle(probe).width);
    };
    const resolved = { narrow: px(tokens.narrow), wide: px(tokens.wide) };
    probe.remove();
    return resolved;
  })();

  const main = document.querySelector("main");
  // The **border** box, because that is the box `max-width` bounds: `box-sizing: border-box`
  // is set globally in `globals.css`. Measuring the content box instead would hand the gate
  // the element's own horizontal padding as slack — at 1440px `<main>`'s `px-6` is 48px of it,
  // enough to hide an uncapped 1184px frame under the 1152px token and make the check
  // unfalsifiable (#575 review).
  const box = el => (el ? el.getBoundingClientRect().width : null);

  // The content column is an explicit contract element — `data-shell-column`, stamped by the
  // shell in both the real layout and this harness — rather than "whatever div comes first".
  // A structural edit that drops it fails the run loudly instead of silently measuring <main>.
  const column = main?.querySelector("[data-shell-column]");

  const overflow = [];
  for (const el of document.querySelectorAll("main *, header *, nav *")) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    if (getComputedStyle(el).visibility === "hidden") continue;
    if (rect.right > innerWidth + 1 || rect.left < -1) {
      overflow.push({
        element: descriptor(el),
        text: (el.textContent ?? "").slice(0, 80),
        left: rect.left,
        right: rect.right,
        width: rect.width,
      });
    }
  }

  return {
    viewport: { width: innerWidth, height: innerHeight },
    documentWidth: document.documentElement.scrollWidth,
    shell,
    frameWidth: box(main),
    columnWidth: box(column),
    // Whether this page opted into the wide column. A converted page is *allowed* the frame;
    // an unconverted one is not, and that asymmetry is the whole point of the per-route
    // opt-in, so the gate has to read the declaration rather than assume one answer.
    optedIn: Boolean(column?.querySelector("[data-shell=wide]")),
    // Whether the sidebar is the navigation in play — it must be, at this viewport, for the
    // measurement to mean what the ADR says it means. Computed display, not a class string:
    // `lg:flex` present in markup proves nothing about what the breakpoint resolved to.
    sidebarVisible: (() => {
      const nav = document.querySelector("[data-shell-nav='sidebar']");
      return Boolean(nav) && getComputedStyle(nav).display !== "none";
    })(),
    overflow,
  };
}

async function capture(page, meta) {
  const query = new URLSearchParams({
    journey: meta.journey,
    skin: meta.skin,
    mode: meta.mode,
    fixture: meta.fixture,
  });
  await page.goto(`${BASE}/?${query}`, { timeout: 20000 });
  // `data-journey` carries the query value, so a mount that threw never passes this.
  await page.waitForSelector(`main[data-journey="${meta.journey}"]`, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  const measured = await page.evaluate(measure, SHELL_TOKENS);
  if (measured.columnWidth === null) {
    throw new Error("no [data-shell-column] inside <main> — the shell contract moved");
  }
  if (!measured.sidebarVisible) {
    throw new Error("no sidebar mounted at this viewport — the wide shell is not under test");
  }

  // 1px of slack throughout: sub-pixel layout rounding is not a defect.
  const slack = 1;
  return {
    ...meta,
    ...measured,
    documentOverflow: measured.documentWidth > measured.viewport.width,
    // The frame must not exceed the wide token…
    frameOverCap: measured.frameWidth !== null
      && measured.frameWidth > measured.shell.wide + slack,
    // …and a page that has *not* opted in must still render its content in the narrow one.
    columnOverNarrow: !measured.optedIn
      && measured.columnWidth > measured.shell.narrow + slack,
    elementOverflow: measured.overflow.length,
  };
}

const cases = JOURNEYS.flatMap(journey =>
  SKINS.flatMap(skin =>
    MODES.flatMap(mode =>
      FIXTURES.map(fixture => ({ journey, skin, mode, fixture })),
    ),
  ),
);

const browser = await chromium.launch({ executablePath: executablePath() });
const page = await browser.newPage({ viewport: VIEWPORT });
const results = [];
const failures = [];
for (const meta of cases) {
  try {
    results.push(await capture(page, meta));
  } catch (error) {
    failures.push({ ...meta, error: error.message.split("\n")[0] });
  }
}
await browser.close();

const version = execFileSync("node", ["-e", "console.log(require('playwright/package.json').version)"], { encoding: "utf8" }).trim();
const chromeVersion = await (async () => {
  const probe = await chromium.launch({ executablePath: executablePath() });
  const value = probe.version();
  await probe.close();
  return value;
})();

const count = predicate => results.filter(predicate).length;
const summary = {
  adr: "0088",
  revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  timestamp: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  engine: `chromium ${chromeVersion} (playwright ${version})`,
  engineBoundary: "Chromium only; WebKit is not installed in this container.",
  viewport: VIEWPORT,
  cases: results.length,
  failures: failures.length,
  documentOverflow: count(result => result.documentOverflow),
  frameOverCap: count(result => result.frameOverCap),
  columnOverNarrow: count(result => result.columnOverNarrow),
  byJourney: Object.fromEntries(
    JOURNEYS.map(journey => {
      const mine = results.filter(result => result.journey === journey);
      return [journey, {
        cells: mine.length,
        maxDocumentWidth: Math.max(0, ...mine.map(cell => cell.documentWidth)),
        maxFrameWidth: Math.max(0, ...mine.map(cell => cell.frameWidth ?? 0)),
        maxColumnWidth: Math.max(0, ...mine.map(cell => cell.columnWidth ?? 0)),
        overflowing: mine.filter(cell => cell.documentOverflow).length,
        frameOverCap: mine.filter(cell => cell.frameOverCap).length,
        columnOverNarrow: mine.filter(cell => cell.columnOverNarrow).length,
        // Reported, never gated — the lesson `reflow.mjs` records about fixed containers.
        maxElementOverflow: Math.max(0, ...mine.map(cell => cell.elementOverflow)),
      }];
    }),
  ),
  failureDetail: failures,
};

await mkdir(OUTPUT, { recursive: true });
await writeFile(resolve(OUTPUT, "wide-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(resolve(OUTPUT, "wide-results.json.gz"), gzipSync(JSON.stringify(results)));

console.log(
  `${summary.documentOverflow} of ${results.length} cases overflow a ${VIEWPORT.width}px viewport; `
  + `${summary.frameOverCap} exceed the wide shell cap; ${summary.columnOverNarrow} stretch an unconverted column`,
);
for (const [journey, entry] of Object.entries(summary.byJourney)) {
  console.log(
    `  ${journey}: doc=${entry.maxDocumentWidth} frame=${Math.round(entry.maxFrameWidth)} column=${Math.round(entry.maxColumnWidth)}`
    + ` | overflow=${entry.overflowing}/${entry.cells} overCap=${entry.frameOverCap} overNarrow=${entry.columnOverNarrow}`
    + ` | maxElementOverflow=${entry.maxElementOverflow}`,
  );
}
if (failures.length) {
  console.log(`\n${failures.length} capture failures:`);
  for (const failure of failures.slice(0, 10)) {
    console.log(`  ${failure.journey}/${failure.skin}/${failure.mode}/${failure.fixture}: ${failure.error}`);
  }
}

if (summary.documentOverflow > 0 || summary.frameOverCap > 0
  || summary.columnOverNarrow > 0 || failures.length > 0) {
  process.exit(1);
}
