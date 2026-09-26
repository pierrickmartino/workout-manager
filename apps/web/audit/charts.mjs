import { chromium, webkit } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
const output = resolve(process.env.UI_CHART_OUTPUT ?? "../../docs/development/chart-accessibility-evidence");
await mkdir(output, { recursive: true });
const cases = [], errors = [], versions = {};
for (const [browserName, engine] of Object.entries({ chromium, webkit })) {
  let browser;
  try { browser = await engine.launch(); } catch (error) { errors.push({ browserName, blocked: error.message }); continue; }
  versions[browserName] = browser.version();
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, reducedMotion: "reduce" });
  const surfaces = process.env.UI_CHART_SURFACES?.split(",") ?? ["volume", "distance", "top", "miniature", "balance", "split", "atlas"];
  const configurations = surfaces.flatMap(surface => ["empty", "single", "multi", "sparse", "large"].flatMap(variant => {
    const ranges = ["volume", "distance", "split"].includes(surface) ? [30, 90, 150] : [30];
    const units = ["volume", "top", "miniature"].includes(surface) ? ["kg", "lb"] : ["kg"];
    return ranges.flatMap(range => units.map(unit => ({ surface, variant, range, unit })));
  }));
  for (const { surface, variant, range, unit } of configurations) {
    if (process.env.UI_CHART_CASE && `${surface}/${variant}/${range}/${unit}` !== process.env.UI_CHART_CASE) continue;
    const meta = { browserName, surface, variant, range, unit }, pageErrors = [];
    const onError = error => pageErrors.push(error.message);
    page.on("pageerror", onError);
    try {
      await page.goto(`http://127.0.0.1:4173/?${new URLSearchParams({ journey: "charts", surface, variant, range: String(range), unit })}`);
      const section = page.locator("[data-chart-surface]"); await section.waitFor({ state: "attached" });
      await page.evaluate(() => document.fonts.ready);
      if (["volume", "distance", "top", "miniature"].includes(surface) && variant !== "empty") await section.locator("svg.recharts-surface").waitFor();
      const inputs = JSON.parse(await page.locator("#chart-inputs").textContent());
      const before = await section.ariaSnapshot();
      const dom = await section.evaluate(el => ({ text: el.innerText, tables: el.querySelectorAll("table,[role=table],[role=grid]").length,
        svg: [...el.querySelectorAll("svg.recharts-surface")].map(svg => ({ role: svg.getAttribute("role"), tabindex: svg.getAttribute("tabindex") })),
        names: [...el.querySelectorAll("[aria-label]")].map(node => ({ role: node.getAttribute("role"), name: node.getAttribute("aria-label") })) }));
      await page.mouse.move(0, 0); await page.locator("h1").click();
      const tabStops = [];
      for (let i = 0; i < (surface === "atlas" ? 60 : 10); i++) {
        await page.keyboard.press("Tab");
        const focus = await page.evaluate(() => ({ tag: document.activeElement.tagName,
          name: document.activeElement.getAttribute("aria-label") ?? document.activeElement.textContent,
          inside: !!document.activeElement.closest("[data-chart-surface]"), outline: getComputedStyle(document.activeElement).outline, shadow: getComputedStyle(document.activeElement).boxShadow }));
        if (focus.inside) tabStops.push(focus);
      }
      const keyboardSnapshot = await section.ariaSnapshot();
      let arrowResult = "not reachable by Tab";
      const svg = section.locator("svg.recharts-surface[tabindex='0']");
      if (await svg.count()) { await svg.first().focus(); await page.keyboard.press("ArrowRight"); arrowResult = await section.ariaSnapshot(); }
      const pointer = [];
      const marks = section.locator(surface === "volume" ? ".recharts-line-dots circle" : ".recharts-bar-rectangle path");
      const rows = surface === "volume" ? inputs.volume : surface === "distance" ? inputs.distance : inputs.tiles[0]?.trend.rows ?? [];
      const markRows = surface === "distance" ? rows.filter(row => row.km !== 0) : rows;
      for (let i = 0; i < await marks.count(); i++) {
        await marks.nth(i).scrollIntoViewIfNeeded(); const box = await marks.nth(i).boundingBox();
        if (!box || box.height === 0) { pointer.push({ index: i, blocked: "zero-size mark" }); continue; }
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(20);
        const tooltip = section.locator(".recharts-tooltip-wrapper"), observed = await tooltip.innerText(), row = markRows[i];
        const expected = row ? `${surface === "distance" ? row.km : Math.round(surface === "volume" ? row.volume : row.estimate)} ${surface === "distance" ? "km" : unit}` : null;
        pointer.push({ index: i, expected, observed, matches: !!expected && observed.includes(expected) && observed.toLowerCase().includes(row.label.toLowerCase()), live: await tooltip.locator("[aria-live],[role=status],[role=alert]").count() });
      }
      // Recharts omits zero-height bar paths; probe the missing category slot.
      if (surface === "distance" && rows.some(row => row.km === 0) && await marks.count() >= 2) {
        const first = await marks.nth(0).boundingBox(), second = await marks.nth(1).boundingBox();
        const firstIndex = rows.findIndex(row => row.km !== 0);
        const secondIndex = rows.findIndex((row, index) => index > firstIndex && row.km !== 0);
        if (first && second) {
          const firstX = first.x + first.width / 2;
          const step = (second.x + second.width / 2 - firstX) / (secondIndex - firstIndex);
          for (const [index, row] of rows.entries()) {
            if (row.km !== 0) continue;
            await page.mouse.move(firstX + (index - firstIndex) * step, first.y + first.height / 2);
            await page.waitForTimeout(20);
            const tooltip = section.locator(".recharts-tooltip-wrapper"), observed = await tooltip.innerText();
            pointer.push({ index, zero: true, expected: "0 km", observed,
              matches: observed.includes("0 km") && observed.toLowerCase().includes(row.label.toLowerCase()),
              live: await tooltip.locator("[aria-live],[role=status],[role=alert]").count() });
          }
        }
      }
      let interaction = null;
      if (surface === "atlas" && variant !== "empty") {
        const group = section.getByRole("button", { name: /^Legs:/ });
        await group.focus(); await page.keyboard.press("Enter");
        const trigger = section.getByRole("button", { name: /Quadriceps:.*sets/ }).last();
        await trigger.focus(); await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog"); await dialog.waitFor(); interaction = { dialog: await dialog.ariaSnapshot() };
        await page.keyboard.press("Escape"); interaction.restored = await trigger.evaluate(el => document.activeElement === el);
        const svgTrigger = section.locator("svg [role=button][aria-label^='Quadriceps:']").first();
        if (await svgTrigger.count()) { await svgTrigger.focus(); await page.keyboard.press("Space"); await dialog.waitFor();
          interaction.svgDialog = await dialog.ariaSnapshot(); await page.keyboard.press("Escape"); interaction.svgRestored = await svgTrigger.evaluate(el => document.activeElement === el); }
      }
      cases.push({ ...meta, inputs, before, dom, tabStops, keyboardSnapshot, arrowResult, pointer, interaction, pageErrors });
    } catch (error) { errors.push({ ...meta, error: error.message }); }
    finally { page.off("pageerror", onError); }
    if (cases.length % 10 === 0) console.log(`${browserName}: ${cases.length} cases recorded`);
  }
  await browser.close();
}
const result = { date: new Date().toISOString(), revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), versions,
  method: "Isolated production components, synthetic data. Snapshots are not spoken output; ranges change fixtures, not production filters; links are not followed.", cases, errors };
await writeFile(resolve(output, "results.json.gz"), gzipSync(JSON.stringify(result)));
const summary = { date: result.date, revision: result.revision, versions, cases: cases.length, errors,
  nonemptyRecharts: cases.filter(c => ["volume", "distance", "top"].includes(c.surface) && c.variant !== "empty").length,
  reachableRecharts: cases.filter(c => ["volume", "distance", "top"].includes(c.surface) && c.tabStops.length).length,
  pointerMatches: cases.flatMap(c => c.pointer).filter(p => p.matches).length,
  pointerMismatches: cases.flatMap(c => c.pointer.map(p => ({ ...p, surface: c.surface, browserName: c.browserName, variant: c.variant }))).filter(p => p.matches === false),
  atlasInteractions: cases.filter(c => c.interaction).map(c => ({ browserName: c.browserName, variant: c.variant, restored: c.interaction.restored, svgRestored: c.interaction.svgRestored })) };
await writeFile(resolve(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ cases: summary.cases, errors: errors.length, reachableRecharts: summary.reachableRecharts, pointerMatches: summary.pointerMatches, pointerMismatches: summary.pointerMismatches.length }));
process.exitCode = errors.length || cases.some(c => c.pageErrors.length) ? 1 : 0;
