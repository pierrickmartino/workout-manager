import { chromium, webkit } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inspect } from "./inspect.mjs";

const output = resolve(process.env.UI_AUDIT_OUTPUT ?? "../../docs/development/ui-layout-revalidation-evidence");
const skins = ["pulse", "aurora", "vercel", "alpine", "clay", "track"];
const journeys = ["profile", "sessions", "history", "catalog", "creation", "logging", "live", "analytics"];
const fixtures = ["short", "session-spaced", "session-unbroken", "exercise-spaced", "exercise-unbroken"];
const resumed = process.env.UI_AUDIT_RESUME === "1"
  ? JSON.parse(gunzipSync(await readFile(resolve(output, "results.json.gz")))) : null;
let results = [...(resumed?.results ?? [])], failures = [...(resumed?.failures ?? [])];
const identity = result => [result.browser, result.skin, result.mode, result.width, result.height, result.fixture, result.journey, result.fonts, result.state].join("/");
let captured = new Set(results.map(identity));
const manifest = JSON.parse(await readFile("audit/production-fonts/manifest.json", "utf8"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
if (hash(await readFile("app/layout.tsx")) !== manifest.layoutSha256) throw new Error("Font snapshot is stale: regenerate from Next output");
for (const file of manifest.files) {
  if (hash(await readFile(resolve("audit/production-fonts", file.file))) !== file.sha256) throw new Error(`Font bytes changed: ${file.file}`);
}
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const fontIdentity = snapshot => JSON.stringify({ layout: snapshot.layoutSha256,
  files: snapshot.files.map(file => `${file.file}:${file.sha256}`).toSorted() });
if (resumed && (resumed.revision !== revision || fontIdentity(resumed.fontManifest) !== fontIdentity(manifest))) {
  throw new Error("Cannot resume evidence from a different application revision or font snapshot; use a new output directory");
}
let evidence = {
  ...resumed,
  issue: 562, revision,
  timestamp: resumed?.timestamp ?? new Date().toISOString(), node: process.version, platform: process.platform,
  fontManifest: manifest,
  fixtureDefinitions: {
    short: "Short Session, Exercise, author and profile names",
    "session-spaced": "Long workout name with spaces ".repeat(5).slice(0, 120),
    "session-unbroken": "W".repeat(120),
    "exercise-spaced": "Long exercise name with spaces ".repeat(4).slice(0, 100),
    "exercise-unbroken": "W".repeat(100),
  },
};
await mkdir(output, { recursive: true });
async function measureCompletedNotes(page, measured) {
  // The set table (ADR-0114) reads each member's prescription and last time once, in its
  // header; the card holding a completed row is the one measured.
  const card = page.locator("[data-set-table]").filter({ has: page.getByRole("button", { name: /^Reopen / }) }).first();
  const notes = { prescription: await card.locator("[data-member-prescription]").first().textContent(),
    previous: await card.locator("[data-member-last]").first().textContent() };
  const prescription = measured.texts.find(text => text.text === notes.prescription);
  const previous = measured.texts.find(text => text.text === notes.previous);
  if (!prescription || !previous) throw new Error("Completed card notes were not measured");
  return { prescription, previous };
}
async function capture(page, meta) {
  if (captured.has(identity(meta))) return;
  let errors = [];
  const onError = error => { errors = [...errors, error.message]; };
  page.on("pageerror", onError);
  try {
    await page.goto(`http://127.0.0.1:4173/?${new URLSearchParams(meta)}`, { timeout: 15000 });
    await page.waitForSelector(`main[data-journey="${meta.journey}"]`);
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(async () => {
      const handles = ["space-grotesk", "jetbrains-mono", "bricolage", "inter", "ibm-plex-mono", "geist", "geist-mono"];
      const families = handles.map(handle => getComputedStyle(document.documentElement).getPropertyValue(`--font-${handle}`).split(",")[0].trim());
      const loaded = await Promise.all(families.map(family => document.fonts.load(`400 16px ${family}`, "Synthetic W")));
      if (loaded.some(faces => !faces.length)) throw new Error("A font family resolved to fallback only");
      return families;
    });
    if (meta.state === "drawer") {
      if (meta.journey === "catalog") await page.getByRole("button", { name: /(?:Long exercise name|Synthetic squat|W{20})/ }).first().click();
      else await page.getByRole("button", { name: "Open muscle details" }).click();
      await page.getByRole("dialog").waitFor();
    }
    if (meta.state === "completed-set") await page.getByRole("button", { name: /^Complete / }).first().evaluate(button => button.click());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (errors.length) throw new Error(errors.join("; "));
    if (!await page.evaluate(() => getComputedStyle(document.querySelector("nav")).position === "fixed" && getComputedStyle(document.querySelector("main")).paddingLeft === "24px")) throw new Error("Production utility stylesheet did not load");
    const measured = await page.evaluate(inspect);
    const completedNotes = meta.state === "completed-set" ? await measureCompletedNotes(page, measured) : null;
    const accents = await page.evaluate(() => Object.fromEntries(["cyan", "blue", "violet", "magenta", "amber", "green"].map(accent => [accent, getComputedStyle(document.documentElement).getPropertyValue(`--color-${accent}`).trim()])));
    const result = { ...meta, fontsLoadedFamilies: fonts, ...measured, accents,
      ...(completedNotes ? { completedNotes } : {}) };
    results = [...results, result];
    captured = new Set([...captured, identity(meta)]);
  } catch (error) {
    const failure = { ...meta, error: error.message };
    failures = [...failures, failure];
    console.error(JSON.stringify(failure));
  }
  finally { page.off("pageerror", onError); }
}
for (const [engine, type] of [["chromium", chromium], ["webkit", webkit]]) {
  let browser;
  try {
    browser = await type.launch();
    evidence = { ...evidence, [`${engine}Version`]: browser.version() };
    const page = await browser.newPage({ reducedMotion: "reduce" });
    page.setDefaultTimeout(15000);
    page.on("dialog", dialog => dialog.accept());
    await page.addInitScript(() => localStorage.clear());
    for (const [skin, mode] of skins.flatMap(skin => ["dark", "light"].map(mode => [skin, mode]))) {
      await page.emulateMedia({ colorScheme: mode });
      for (const [width, height] of [[320, 568], [568, 320]]) {
        await page.setViewportSize({ width, height });
        for (const [fixture, journey] of fixtures.flatMap(fixture => journeys.map(journey => [fixture, journey]))) {
          const meta = { browser: engine, skin, mode, width, height, fixture, journey, fonts: "production", state: "default" };
          await capture(page, meta);
          // Paired font-only control: identical current code, content and viewport.
          await capture(page, { ...meta, fonts: "fontsource" });
        }
        for (const [journey, fixture] of ["catalog", "analytics"].flatMap(journey => ["short", "exercise-spaced", "exercise-unbroken"].map(fixture => [journey, fixture]))) {
          await capture(page, { browser: engine, skin, mode, width, height, fixture, journey, fonts: "production", state: "drawer" });
        }
        await capture(page, { browser: engine, skin, mode, width, height, fixture: "short", journey: "live", fonts: "production", state: "completed-set" });
        await capture(page, { browser: engine, skin, mode, width, height, fixture: "short", journey: "contrast", fonts: "production", state: "default" });
      }
      await writeFile(resolve(output, "results.json.gz"), gzipSync(JSON.stringify({ ...evidence, results, failures })));
      console.log(`${engine}: ${skin}/${mode}: ${results.length} captures, ${failures.length} runner failures`);
    }
  } catch (error) { failures = [...failures, { browser: engine, error: error.message }]; }
  finally { await browser?.close(); }
}
const unresolvedFailures = failures.filter(failure => !captured.has(identity(failure)));
await writeFile(resolve(output, "results.json.gz"), gzipSync(JSON.stringify({ ...evidence, results, failures })));
console.log(`Evidence: ${output}`);
if (unresolvedFailures.length) process.exitCode = 1;
