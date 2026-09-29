// Narrow-screen reflow sweep (ADR-0085, #562 follow-up).
//
// The 4,224-capture `revalidate.mjs` matrix is a one-time evidence artefact: it pairs font
// payloads, samples contrast over 4,000 elements per page and needs a resume mode to finish.
// This runner answers one question — does the document overflow a 320px viewport — so it can
// be re-run in a minute while a fix is being written. It mounts the *same* `audit/main.tsx`
// journeys against the *same* `audit/fixtures.ts` names, so its numbers sit beside the
// recorded matrix rather than describing a second, divergent fixture set.
//
// Two journeys here were never in that matrix and are tagged `novel`, so the eight comparable
// ones stay extractable: `correction` (mountable all along, never swept, and holding five
// content-floored grids) and `creation-logged` (the Hand-Authored form in its default
// `authorAndLog` flow, whose performed-set grid `planOnly` hid from every recorded capture).
//
// What it gates on: document overflow, the measure the success criteria name. What it records
// without gating: any element whose right edge passes the viewport. The Atlas drawer taught
// the matrix that a fixed container hides element overflow from the document width, and that
// defect is a different shape from this one — so it is measured and reported, never gated.
//
// Chromium only: this container has no WebKit, so the two-engine criterion stays half-met by
// declaration rather than by silence. See the dated section in the 28 September audit.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";

const BASE = process.env.UI_AUDIT_BASE ?? "http://127.0.0.1:4173";
const OUTPUT = resolve(process.env.UI_AUDIT_OUTPUT ?? "../../docs/development/ui-reflow-evidence");
const VIEWPORT = { width: 320, height: 568 };
// WCAG 1.4.4 resize-text: the root font doubles while the viewport does not. This is the case
// that breaks a fixed-width box, and it is *not* the authenticated 200% real-app check the
// success criteria ask for — that one stays open.
const TEXT_SCALE = 2;

const SKINS = ["pulse", "aurora", "vercel", "alpine", "clay", "track"];
const MODES = ["light", "dark"];
const FIXTURES = ["short", "session-spaced", "session-unbroken", "exercise-spaced", "exercise-unbroken"];
// The eight from the recorded matrix, then the two this sweep adds.
const MATRIX_JOURNEYS = ["profile", "sessions", "history", "catalog", "creation", "logging", "live", "analytics"];
const NOVEL_JOURNEYS = ["correction", "creation-logged"];

// Journeys known to overflow at 200% text, and why. Every one is a `rem`-sized grid track in a
// form field row: `grid-cols-[7rem_1fr]` is a 224px column once the root font doubles, so the
// row cannot fit 320px however well its contents shrink. That is a fixed-track defect, not an
// unshrinkable-box one, and fixing it means those rows stack at narrow widths — a change to
// four forms' layout that belongs to its own issue, not to this one.
//
// This list is a **ratchet, not an excuse**: every journey outside it must pass at 200%, so a
// new 200% regression fails the run; and an entry that stops overflowing fails the run too, so
// the list can only shrink. It is the honest middle between gating on a defect we have chosen
// not to fix here (permanently red, therefore worthless) and reporting it in prose nobody runs.
const KNOWN_200_TEXT_OVERFLOW = ["logging", "live", "correction", "creation-logged"];

// The repo pins a Playwright whose Chromium build this container does not carry, so the
// bundled resolver fails. Prefer whatever Playwright resolves; fall back to the installed
// browser rather than downloading one.
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

// Runs in the page. Deliberately does no colour work: this is a layout measure, and keeping
// it cheap is what makes the runner re-runnable. The overflow predicate matches
// `inspect.mjs` exactly (`rect.right > innerWidth + 1`) so both reports mean the same thing.
function measure() {
  const descriptor = el =>
    `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${String(el.getAttribute("class") ?? "").split(/\s+/).slice(0, 5).join(".")}`;
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
    rootFontSize: getComputedStyle(document.documentElement).fontSize,
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
  if (meta.textScale !== 1) {
    await page.evaluate(scale => {
      document.documentElement.style.fontSize = `${16 * scale}px`;
    }, meta.textScale);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  const measured = await page.evaluate(measure);
  return {
    ...meta,
    ...measured,
    documentOverflow: measured.documentWidth > measured.viewport.width,
    elementOverflow: measured.overflow.length,
  };
}

const cases = [
  ...MATRIX_JOURNEYS.map(journey => ({ journey, novel: false })),
  ...NOVEL_JOURNEYS.map(journey => ({ journey, novel: true })),
].flatMap(({ journey, novel }) =>
  SKINS.flatMap(skin =>
    MODES.flatMap(mode =>
      FIXTURES.flatMap(fixture =>
        [1, TEXT_SCALE].map(textScale => ({ journey, novel, skin, mode, fixture, textScale })),
      ),
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

const at = scale => results.filter(result => result.textScale === scale);
const failing = list => list.filter(result => result.documentOverflow);
const summary = {
  issue: 570,
  revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  timestamp: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  engine: `chromium ${chromeVersion} (playwright ${version})`,
  // Stated, not implied: the recorded matrix ran Chromium 153 on macOS. Font rasterisation
  // differs, so widths drift; the *defects* must still reproduce.
  engineBoundary: "Chromium only; WebKit is not installed in this container. Widths are not expected to match the macOS Chromium 153 matrix exactly.",
  viewport: VIEWPORT,
  cases: results.length,
  failures: failures.length,
  documentOverflow: {
    at100: failing(at(1)).length,
    at200Text: failing(at(TEXT_SCALE)).length,
  },
  known200TextOverflow: KNOWN_200_TEXT_OVERFLOW,
  byJourney: Object.fromEntries(
    [...MATRIX_JOURNEYS, ...NOVEL_JOURNEYS].map(journey => {
      const mine = results.filter(result => result.journey === journey);
      const perFixture = Object.fromEntries(FIXTURES.map(fixture => {
        const cells = mine.filter(result => result.fixture === fixture && result.textScale === 1);
        return [fixture, {
          maxDocumentWidth: Math.max(0, ...cells.map(cell => cell.documentWidth)),
          overflowing: failing(cells).length,
          cells: cells.length,
        }];
      }));
      return [journey, {
        novel: NOVEL_JOURNEYS.includes(journey),
        perFixture,
        at200Text: {
          overflowing: failing(mine.filter(result => result.textScale === TEXT_SCALE)).length,
          cells: mine.filter(result => result.textScale === TEXT_SCALE).length,
        },
        // Reported, never gated (the Atlas-drawer lesson).
        maxElementOverflow: Math.max(0, ...mine.map(result => result.elementOverflow)),
      }];
    }),
  ),
  failureDetail: failures,
};

await mkdir(OUTPUT, { recursive: true });
await writeFile(resolve(OUTPUT, "reflow-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
// Every element rect of every overflowing case, which is what makes a finding diagnosable
// rather than merely counted — compressed, as the existing evidence directories are.
await writeFile(resolve(OUTPUT, "reflow-results.json.gz"), gzipSync(JSON.stringify(results)));

const label = `${summary.documentOverflow.at100} of ${at(1).length} cases overflow at 100% text, ${summary.documentOverflow.at200Text} of ${at(TEXT_SCALE).length} at 200%`;
console.log(label);
for (const [journey, entry] of Object.entries(summary.byJourney)) {
  const widths = FIXTURES.map(fixture => `${fixture}=${entry.perFixture[fixture].maxDocumentWidth}(${entry.perFixture[fixture].overflowing}/${entry.perFixture[fixture].cells})`);
  console.log(`  ${journey}${entry.novel ? " [novel]" : ""}: ${widths.join(" ")} | 200%: ${entry.at200Text.overflowing}/${entry.at200Text.cells} | maxElementOverflow=${entry.maxElementOverflow}`);
}
if (failures.length) {
  console.log(`\n${failures.length} capture failures:`);
  for (const failure of failures.slice(0, 10)) console.log(`  ${failure.journey}/${failure.skin}/${failure.mode}/${failure.fixture}: ${failure.error}`);
}
// The gate is document overflow. `UI_REFLOW_BASELINE=1` inverts it: a baseline run is
// expected to reproduce the defects, and a clean baseline means the runner is not looking
// at what the recorded matrix looked at.
// Two gates. Document overflow at 100% text must be zero everywhere — the measure ADR-0085
// asserts. At 200% text the ratchet applies: a journey outside `KNOWN_200_TEXT_OVERFLOW` that
// overflows is a regression, and a journey inside it that no longer overflows is a stale entry
// to delete.
const regressed200 = Object.entries(summary.byJourney)
  .filter(([journey, entry]) => entry.at200Text.overflowing > 0 && !KNOWN_200_TEXT_OVERFLOW.includes(journey))
  .map(([journey]) => journey);
const stale200 = Object.entries(summary.byJourney)
  .filter(([journey, entry]) => entry.at200Text.overflowing === 0 && KNOWN_200_TEXT_OVERFLOW.includes(journey))
  .map(([journey]) => journey);
if (summary.documentOverflow.at200Text > 0) {
  console.log(`\nKnown open at 200% text: ${KNOWN_200_TEXT_OVERFLOW.join(", ")} (fixed rem-sized grid tracks in form field rows).`);
}
for (const journey of regressed200) console.error(`200% text regression: ${journey} is not on the known-overflow list but overflows.`);
for (const journey of stale200) console.error(`Stale known-overflow entry: ${journey} passes at 200% text — remove it from KNOWN_200_TEXT_OVERFLOW.`);

if (process.env.UI_REFLOW_BASELINE === "1") {
  if (summary.documentOverflow.at100 === 0) {
    console.error("\nBaseline reproduced no document overflow — the runner is not exercising the recorded defects.");
    process.exit(1);
  }
  console.log("\nBaseline reproduced the defects, as expected.");
} else if (summary.documentOverflow.at100 > 0 || failures.length > 0
  || regressed200.length > 0 || stale200.length > 0) {
  process.exit(1);
}
