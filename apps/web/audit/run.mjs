import { chromium, webkit } from "@playwright/test";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { inspect } from "./inspect.mjs";
import { gzipSync } from "node:zlib";

const base = "http://127.0.0.1:4173";
const output = resolve(process.env.UI_AUDIT_OUTPUT ?? "../../docs/development/ui-layout-evidence");
const skins = ["pulse", "aurora", "vercel", "alpine", "clay", "track"];
const journeys = ["profile", "sessions", "history", "catalog", "creation", "logging", "live", "analytics"];
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const results = [], failures = [];
await mkdir(resolve(output, "screenshots"), { recursive: true });

async function zoom(worker, value) {
  let timeout;
  try { return await Promise.race([worker.evaluate(async value => {
    const [tab] = await chrome.tabs.query({ url: "http://127.0.0.1:4173/*" });
    if (!tab) throw new Error("Audit tab not found");
    await chrome.tabs.setZoomSettings(tab.id, { mode: "automatic", scope: "per-tab" });
    await chrome.tabs.setZoom(tab.id, value);
    return chrome.tabs.getZoom(tab.id);
  }, value), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Zoom worker timeout")), 10000); })]);
  } finally { clearTimeout(timeout); }
}

async function capture(page, meta, worker, browserZoom = 1) {
  const errors = [];
  const handler = error => errors.push(error.message);
  page.on("pageerror", handler);
  const start = performance.now();
  try {
    await page.goto(`${base}/?${new URLSearchParams({ journey: meta.journey, skin: meta.skin, mode: meta.mode, count: String(meta.count ?? 2) })}`);
    if (worker) {
      meta.reportedZoom = await zoom(worker, browserZoom);
      if (Math.abs(meta.reportedZoom - browserZoom) > 0.01) throw new Error("Browser zoom did not apply");
    }
    await page.waitForSelector("main[data-journey]", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector("main")?.textContent.length > 30);
    if (await page.locator("main").getAttribute("data-journey") !== meta.journey) throw new Error("Fixture navigation did not reach requested journey");
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (errors.length) throw new Error(errors.join("; "));
    const stylesReady = await page.evaluate(() => getComputedStyle(document.querySelector("nav")).position === "fixed" && getComputedStyle(document.querySelector("main")).paddingLeft === "24px");
    if (!stylesReady) throw new Error("Production utility stylesheet did not load");
    if (meta.journey === "catalog" && meta.count !== 0) {
      const section = page.getByRole("button", { name: /Squat/ }).first();
      if (await section.getAttribute("aria-expanded") === "false") await section.click();
    }
    if (meta.state === "drawer") {
      if (meta.journey === "analytics") await page.getByRole("button", { name: "Open muscle details" }).click();
      if (meta.journey === "catalog") {
        await page.getByRole("button", { name: /Long exercise name/ }).first().click();
      }
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(350);
    }
    const measured = await page.evaluate(inspect);
    const result = { ...meta, browserZoom, durationMs: performance.now() - start, ...measured };
    if (meta.screenshot) {
      const file = `${meta.browser}-${meta.skin}-${meta.mode}-${meta.journey}-${meta.width}x${meta.height}-z${browserZoom}-${meta.state ?? "default"}.png`;
      // Viewport screenshots remain bounded even for 10k records.
      await page.screenshot({ path: resolve(output, "screenshots", file) });
      result.screenshot = `screenshots/${file}`;
    }
    results.push(result);
    return result;
  } catch (error) {
    failures.push({ ...meta, browserZoom, error: error.message });
    console.error(`${meta.browser}/${meta.journey}: ${error.message.slice(0, 180)}`);
  } finally { page.off("pageerror", handler); }
}

for (const engine of ["chromium", "webkit"]) {
  let context, browser, worker;
  try {
    if (engine === "chromium") {
      const extension = resolve("audit/zoom-extension");
      context = await chromium.launchPersistentContext(await mkdtemp(resolve(tmpdir(), "ui-audit-")), {
        channel: "chromium", headless: true, viewport: { width: 320, height: 568 },
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      });
      worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    } else {
      browser = await webkit.launch();
      context = await browser.newContext();
    }
    const page = context.pages()[0] ?? await context.newPage();
    page.on("dialog", dialog => dialog.accept());
    // Explicit modes, every Skin's typography, portrait and landscape.
    for (const skin of skins) for (const mode of ["dark", "light"]) {
      await page.emulateMedia({ colorScheme: mode, reducedMotion: "reduce" });
      for (const [width, height] of [[320, 568], [568, 320]]) {
        await page.setViewportSize({ width, height });
        for (const journey of journeys) {
          await capture(page, { browser: engine, skin, mode, journey, width, height,
            screenshot: width === 320 && mode === "light" && ["profile", "sessions", "catalog", "logging"].includes(journey) }, worker);
        }
      }
      await page.setViewportSize({ width: 320, height: 568 });
      await capture(page, { browser: engine, skin, mode, journey: "contrast", width: 320, height: 568 }, worker);
      console.log(`${engine}: ${skin}/${mode} complete`);
    }
    // System must produce the same resolved token colors for both device preferences.
    for (const skin of skins) for (const preference of ["dark", "light"]) {
      await page.emulateMedia({ colorScheme: preference });
      await capture(page, { browser: engine, skin, mode: "system", preference, journey: "contrast", width: 320, height: 568 }, worker);
    }
    console.log(`${engine}: System resolution complete`);
    await page.emulateMedia({ colorScheme: "light" });
    for (const journey of ["sessions", "history", "catalog"]) {
      await capture(page, { browser: engine, skin: "pulse", mode: "light", journey, count: 0, width: 320, height: 568 }, worker);
    }
    for (const journey of ["catalog", "analytics"]) {
      for (const [width, height] of [[320, 568], [568, 320]]) {
        await page.setViewportSize({ width, height });
        await capture(page, { browser: engine, skin: "pulse", mode: "light", journey, state: "drawer", width, height, screenshot: true }, worker);
      }
    }
    if (worker) {
      for (const skin of skins) for (const [width, height] of [[1280, 800], [320, 568], [568, 320]]) {
        await page.setViewportSize({ width, height });
        for (const journey of journeys) {
          await capture(page, { browser: engine, skin, mode: "light", journey, width, height,
            screenshot: skin === "pulse" && width === 1280 && ["profile", "sessions", "logging"].includes(journey) }, worker, 2);
        }
      }
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const count of [100, 1000, 10000]) {
      const result = await capture(page, { browser: engine, skin: "pulse", mode: "light", journey: "history", count, width: 1280, height: 800 }, worker);
      if (result) {
        const start = performance.now();
        await page.locator("#history-exercise").fill("No such exercise");
        await page.getByText("No sessions match these filters.").waitFor();
        result.filterWallMs = performance.now() - start;
        result.filteredRecords = await page.locator("main > section > ol > li").count();
      }
    }
  } catch (error) {
    failures.push({ browser: engine, error: error.message });
  } finally {
    await context?.close();
    await browser?.close();
    await writeFile(resolve(output, "results.json.gz"), gzipSync(JSON.stringify({ revision, timestamp: new Date().toISOString(), platform: process.platform, node: process.version, results, failures })));
  }
}
console.log(`Captured ${results.length} cases; ${failures.length} runner failures. Evidence: ${output}`);
if (failures.length) process.exitCode = 1;
