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
// `home` joins them with ADR-0088's wide Home: the page is converted to the wide content
// column, so the narrow sweep is what proves the conversion moved nothing at 320px — the
// desktop-only blocks are `hidden` below `lg:` and must cost a phone no width at all.
// `exercise` and `admin` join them with the three MEDIUM audit findings (ADR-0095/0096/0097):
// the Exercise detail page and the admin catalog were never in any journey, so the illustration
// box, the reader's-clock instant and the deferred catalog rows were all unverified in a
// browser however green their guards were.
// `confirm` joins them with ADR-0098: the themed dialog replaced `window.confirm` at three
// destructive actions, and a dialog renders only while it is open, so no existing journey ever
// mounted one. Its message is the app's longest confirmation copy, in a `max-w-sm` box.
// `adhoc` joins them with ADR-0106: it was a renderable case no journey swept, so the ad-hoc
// log's form was unverified at every width while its three sibling log forms were gated — and
// it is the one of the four whose field rows changed shape when they moved onto the shared
// set-entry family, a lone amount field having sat in a two-column grid that gave it half a row
// and left the other half empty.
// `launchpad` joins them with ADR-0109: no journey rendered a launchpad at all, in either
// composition, so a stack of full-width buttons with authored sentences for labels had never been
// measured. See `LaunchpadSurface` in `main.tsx` for what the case holds.
// `levels` joins them with ADR-0112: the Profile *view* page is swept by nothing — the `profile`
// journey mounts the edit form — so its new Fitness Level section would otherwise be a surface
// no journey renders, which is unverified however green its guards are (ADR-0088).
// `sheet` joins them with ADR-0113: the action sheet that replaced the ⋯ More disclosure is a
// modal, so — like `confirm` — it exists only while open and no journey would otherwise mount it.
// Its title is an authored name, the one string in it that can be 120 unbroken characters.
// `protocols` joins them with the Protocols index (#637): a new page whose rows lead with an
// authored Protocol name, so it is swept at 320px and 200% text before anyone relies on it.
// `protocols-live` is the same page with Switch blocked by a Live Session (#638), and Delete too on
// the row that owns it (#639): that row then carries two blocked buttons, each with a sentence of
// reason and a Resume link.
// `set-aside` joins them with ADR-0125: the note a generated Protocol lands with, naming the
// Protocol it set aside, renders only on that landing, and its label is an authored name.
// `passport` and `passport-open` join them with ADR-0126: the Training Passport replaced the
// achievement wall, and its "More to earn" list renders only while the disclosure is open, so
// each state is a journey of its own. `passport-empty` joins them with #651: a brand-new user's
// Passport is an empty state with a link Home, a shape neither of the others renders.
const NOVEL_JOURNEYS = [
  "correction", "creation-logged", "home", "exercise", "admin", "confirm", "adhoc", "launchpad",
  "levels", "sheet", "protocols", "protocols-live", "set-aside", "passport", "passport-open",
  "passport-empty",
];

// The 200% ratchet is gone (#572, ADR-0087). `logging`, `live`, `correction` and
// `creation-logged` were listed here because each held a `rem`-sized grid track in a form field
// row — `grid-cols-[7rem_1fr]` is a 224px column once the root font doubles, so the row could
// not fit 320px however well its contents shrank. Those rows are wrapping flex rows now: each
// field asks for a width and the row stacks when the asks no longer fit. Both text sizes are
// therefore gated the same way, and the list that could only shrink has shrunk to nothing.

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
// A row that stacks must leave each field able to show what it holds, which is the half of the
// 200% criterion document width cannot see (#572). A control counts as **cramped** when its
// border box, minus its own padding and border, leaves less than one mono character — that is
// how a `Select` whose chevron gutter was `pr-10` (80px at 200% text) showed nothing at all
// inside a 114px field. Checkboxes and radios have no value to show, and a control that is not
// rendered has no width to measure.
function measureControls() {
  const cramped = [];
  let total = 0;
  for (const el of document.querySelectorAll("main input, main select")) {
    if (["hidden", "checkbox", "radio"].includes(el.type)) continue;
    const width = el.getBoundingClientRect().width;
    if (!width) continue;
    total += 1;
    const style = getComputedStyle(el);
    const room = width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
    if (room < parseFloat(style.fontSize) * 0.6) {
      cramped.push({
        control: el.getAttribute("aria-label") ?? el.getAttribute("name") ?? el.tagName.toLowerCase(),
        width: Math.round(width),
        room: Math.round(room),
      });
    }
  }
  return { controls: total, cramped };
}

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
  const controls = await page.evaluate(measureControls);
  return {
    ...meta,
    ...measured,
    ...controls,
    documentOverflow: measured.documentWidth > measured.viewport.width,
    elementOverflow: measured.overflow.length,
    crampedControls: controls.cramped.length,
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
const cramped = list => list.reduce((total, result) => total + result.crampedControls, 0);
const summary = {
  issues: [570, 572],
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
  // The other half of the 200% criterion: a stacked row still has to show what its fields hold.
  crampedControls: {
    at100: cramped(at(1)),
    at200Text: cramped(at(TEXT_SCALE)),
    controls: at(TEXT_SCALE).reduce((total, result) => total + result.controls, 0),
  },
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
          cramped: cramped(mine.filter(result => result.textScale === TEXT_SCALE)),
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

const label = `${summary.documentOverflow.at100} of ${at(1).length} cases overflow at 100% text, ${summary.documentOverflow.at200Text} of ${at(TEXT_SCALE).length} at 200%; ${summary.crampedControls.at200Text} of ${summary.crampedControls.controls} controls at 200% have no room for their value`;
console.log(label);
for (const [journey, entry] of Object.entries(summary.byJourney)) {
  const widths = FIXTURES.map(fixture => `${fixture}=${entry.perFixture[fixture].maxDocumentWidth}(${entry.perFixture[fixture].overflowing}/${entry.perFixture[fixture].cells})`);
  console.log(`  ${journey}${entry.novel ? " [novel]" : ""}: ${widths.join(" ")} | 200%: ${entry.at200Text.overflowing}/${entry.at200Text.cells} | cramped@200%: ${entry.at200Text.cramped} | maxElementOverflow=${entry.maxElementOverflow}`);
}
if (failures.length) {
  console.log(`\n${failures.length} capture failures:`);
  for (const failure of failures.slice(0, 10)) console.log(`  ${failure.journey}/${failure.skin}/${failure.mode}/${failure.fixture}: ${failure.error}`);
}
// One gate at both text sizes (#572): document overflow must be zero at 100% text — the measure
// ADR-0085 asserts — and zero at 200% text, which ADR-0087's wrapping rows are what make
// enforceable. A third clause guards the other half of the 200% criterion, that stacking loses
// nothing: no control may be left without room to show its value, which is what would let a
// field's own padding creep back to a `rem` that eats the whole column.
// `UI_REFLOW_BASELINE=1` inverts the first two: a baseline run against a pre-fix revision is
// expected to reproduce the defects at one size or the other, and a clean baseline means the
// runner is not looking at what the recorded matrix looked at.
for (const [journey, entry] of Object.entries(summary.byJourney)) {
  if (entry.at200Text.overflowing > 0) {
    console.error(`200% text overflow: ${journey} widens the document in ${entry.at200Text.overflowing} of ${entry.at200Text.cells} cases.`);
  }
  if (entry.at200Text.cramped > 0) {
    console.error(`200% text crowding: ${journey} leaves ${entry.at200Text.cramped} control(s) with no room for their value.`);
  }
}

if (process.env.UI_REFLOW_BASELINE === "1") {
  if (summary.documentOverflow.at100 === 0 && summary.documentOverflow.at200Text === 0) {
    console.error("\nBaseline reproduced no document overflow — the runner is not exercising the recorded defects.");
    process.exit(1);
  }
  console.log("\nBaseline reproduced the defects, as expected.");
} else if (summary.documentOverflow.at100 > 0 || summary.documentOverflow.at200Text > 0
  || summary.crampedControls.at200Text > 0 || failures.length > 0) {
  process.exit(1);
}
