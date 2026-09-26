import { chromium, webkit } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { inspect } from "./inspect.mjs";

const output = resolve(process.env.UI_AUDIT_OUTPUT ?? "../../docs/development/ui-layout-evidence");
const results = [], failures = [];
const statesOnly = process.env.UI_AUDIT_STATES_ONLY === "1";
const dataOnly = process.env.UI_AUDIT_DATA_ONLY === "1";
const resultFile = statesOnly ? "states.json.gz" : dataOnly ? "catalog-data.json.gz" : "supplementary.json.gz";
const skins = ["pulse", "aurora", "vercel", "alpine", "clay", "track"];
for (const [engine, type] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await type.launch();
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: "reduce" });
  page.on("dialog", dialog => dialog.accept());
  // Each state case starts from the same synthetic session, not the previous case's draft.
  await page.addInitScript(() => { localStorage.clear(); });
  for (const skin of skins) for (const mode of ["dark", "light"]) {
    for (const journey of dataOnly ? [] : statesOnly ? ["live"] : ["contrast", "catalog", "analytics", "live"]) {
      const meta = { browser: engine, skin, mode, journey, width: 320, height: 568, browserZoom: 1, state: statesOnly ? "completed-set" : ["catalog", "analytics"].includes(journey) ? "drawer" : "default" };
      try {
        const errors = [];
        const handler = error => errors.push(error.message);
        page.on("pageerror", handler);
        await page.goto(`http://127.0.0.1:4173/?${new URLSearchParams({ journey, skin, mode })}`);
        await page.waitForSelector("main");
        if (await page.locator("main").getAttribute("data-journey") !== journey) throw new Error("Fixture navigation did not reach requested journey");
        await page.evaluate(() => document.fonts.ready);
        if (statesOnly) await page.getByRole("button", { name: "Complete set", exact: true }).first().click();
        if (journey === "catalog") await page.getByRole("button", { name: /Long exercise name/ }).first().click();
        if (journey === "analytics") await page.getByRole("button", { name: "Open muscle details" }).click();
        if (meta.state === "drawer") await page.getByRole("dialog").waitFor({ timeout: 3000 });
        await page.waitForTimeout(150);
        page.off("pageerror", handler);
        if (errors.length) throw new Error(errors.join("; "));
        const result = { ...meta, ...await page.evaluate(inspect) };
        if (skin === "pulse" && mode === "light") {
          const name = `${engine}-pulse-light-${journey}-320x568-z1-${meta.state}.png`;
          await page.screenshot({ path: resolve(output, "screenshots", name) });
          result.screenshot = `screenshots/${name}`;
        }
        results.push(result);
      } catch (error) { failures.push({ ...meta, error: error.message }); }
    }
    console.log(`${engine}: supplementary ${skin}/${mode}`);
    await writeFile(resolve(output, resultFile), gzipSync(JSON.stringify({ results, failures })));
  }
  for (const journey of statesOnly || dataOnly ? [] : ["creation", "logging", "history"]) {
    await page.goto(`http://127.0.0.1:4173/?journey=${journey}&skin=pulse&mode=light`);
    await page.evaluate(() => document.fonts.ready);
    const screenshot = `screenshots/${engine}-pulse-light-${journey}-320x568-z1-default.png`;
    await page.screenshot({ path: resolve(output, screenshot) });
    results.push({ browser: engine, skin: "pulse", mode: "light", journey, width: 320, height: 568, browserZoom: 1, screenshot, ...await page.evaluate(inspect) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const count of statesOnly ? [] : [100, 1000, 10000]) {
    try {
    const start = performance.now();
    await page.goto(`http://127.0.0.1:4173/?journey=catalog&skin=pulse&mode=light&count=${count}`);
    await page.waitForFunction(count => document.querySelectorAll("main section > ul > li").length === count, count, { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    const readyMs = performance.now() - start;
    const measured = await page.evaluate(inspect);
    const records = await page.locator("main section > ul > li").count();
    const collapsedStart = performance.now();
    await page.locator("main section > button").first().click();
    await page.waitForFunction(() => document.querySelectorAll("main section > ul > li").length === 0);
    results.push({ browser: engine, skin: "pulse", mode: "light", journey: "catalog", count, loadedRecords: records,
      readyMs, collapseWallMs: performance.now() - collapsedStart, ...measured, renderedCatalogRecords: records });
    } catch (error) { failures.push({ browser: engine, journey: "catalog", count, error: error.message }); }
    await writeFile(resolve(output, resultFile), gzipSync(JSON.stringify({ results, failures })));
  }
  await browser.close();
}
await writeFile(resolve(output, resultFile), gzipSync(JSON.stringify({ results, failures })));
console.log(`${results.length} supplementary cases, ${failures.length} failures`);
if (failures.length) process.exitCode = 1;
