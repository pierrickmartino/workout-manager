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
  // `UI_CHROMIUM_EXECUTABLE` / `UI_WEBKIT_EXECUTABLE` point the engine at a browser the
  // container already has, for a runner whose pinned Playwright build differs from the
  // installed one. Unset, Playwright resolves its own — the normal path.
  const executablePath = process.env[`UI_${browserName.toUpperCase()}_EXECUTABLE`] || undefined;
  try { browser = await engine.launch({ executablePath }); } catch (error) { errors.push({ browserName, blocked: error.message }); continue; }
  versions[browserName] = browser.version();
  // `UI_CHART_VIEWPORT=320x640` re-runs the matrix at the narrowest supported width, where
  // an expanded values table must grow the card downward and never widen the document.
  const [vw, vh] = (process.env.UI_CHART_VIEWPORT ?? "900x900").split("x").map(Number);
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, reducedMotion: "reduce" });
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
        // The row's own `valueText`/date text, not a recomputed rounding: the projection is
        // the single definition of displayed precision (ADR-0084), so the harness compares
        // the tooltip against it rather than against a second implementation of the rule.
        const expectedDate = row ? (row.dateText ?? row.weekText) : null;
        // Case-insensitive: the tooltip's date wears `label-mono`, which uppercases it in CSS.
        // The comparison is about the words, not the casing a stylesheet applies.
        pointer.push({ index: i, expected: row?.valueText ?? null, expectedDate, observed,
          matches: !!row && observed.toLowerCase().includes(row.valueText.toLowerCase())
            && observed.toLowerCase().includes(expectedDate.toLowerCase()),
          live: await tooltip.locator("[aria-live],[role=status],[role=alert]").count() });
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
            pointer.push({ index, zero: true, expected: row.valueText, expectedDate: row.weekText, observed,
              matches: observed.toLowerCase().includes(row.valueText.toLowerCase())
                && observed.toLowerCase().includes(row.weekText.toLowerCase()),
              live: await tooltip.locator("[aria-live],[role=status],[role=alert]").count() });
          }
        }
      }
      // Per-point parity (ADR-0084). The guard proves a values table is rendered; only this
      // proves its rows ARE the plotted series. Expand the disclosure by keyboard — the same
      // route a pointerless reader takes — then compare every row's date and value text with
      // the fixture's own input rows, in order. The miniature is asserted to carry NO
      // disclosure: it is a teaser inside aria-hidden and a <Link> (ADR-0024, CH-F4).
      let values = null;
      if (["volume", "distance", "top", "miniature"].includes(surface)) {
        const details = section.locator("details");
        const present = await details.count();
        const expected = (surface === "miniature" ? [] : rows).map(row => ({
          label: row.dateText ?? row.weekText, value: row.valueText }));
        values = { present, expectedRows: expected.length, summary: null, caption: null,
          headings: [], observedRows: [], mismatches: [], keyboardReachable: false };
        if (present) {
          const summaryEl = details.first().locator("summary");
          values.summary = await summaryEl.innerText();
          // Focus then Enter: a native <summary> is keyboard-operable, and this records that
          // it opened without a pointer rather than assuming it.
          await summaryEl.focus();
          values.keyboardReachable = await summaryEl.evaluate(el => document.activeElement === el);
          await page.keyboard.press("Enter");
          await details.first().locator("table").waitFor();
          values.caption = await details.first().locator("caption").innerText();
          values.headings = await details.first().locator("thead th").allInnerTexts();
          const bodyRows = details.first().locator("tbody tr");
          for (let i = 0; i < await bodyRows.count(); i++) {
            const cells = await bodyRows.nth(i).locator("td").allInnerTexts();
            values.observedRows.push({ label: cells[0]?.trim(), value: cells[1]?.trim() });
          }
        }
        values.mismatches = expected.flatMap((row, i) => {
          const observed = values.observedRows[i];
          return observed && observed.label === row.label && observed.value === row.value
            ? [] : [{ index: i, expected: row, observed: observed ?? null }];
        });
        if (values.observedRows.length > expected.length) {
          values.mismatches.push({ index: expected.length, extraRows: values.observedRows.length - expected.length });
        }
        values.parity = values.mismatches.length === 0;
        // Measured with the table open: a values table that reintroduces horizontal scrolling
        // would trade one access defect for the 320px reflow defect the audit's rank 2 covers.
        values.overflow = await page.evaluate(() => ({
          viewport: window.innerWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          overflows: document.documentElement.scrollWidth > window.innerWidth }));
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
      cases.push({ ...meta, inputs, before, dom, tabStops, keyboardSnapshot, arrowResult, pointer, values, interaction, pageErrors });
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
  atlasInteractions: cases.filter(c => c.interaction).map(c => ({ browserName: c.browserName, variant: c.variant, restored: c.interaction.restored, svgRestored: c.interaction.svgRestored })),
  valueCases: cases.filter(c => c.values).length,
  valueParityPasses: cases.filter(c => c.values?.parity).length,
  valuePoints: cases.reduce((total, c) => total + (c.values?.observedRows.length ?? 0), 0),
  valueParityFailures: cases.filter(c => c.values && !c.values.parity).map(c => ({ browserName: c.browserName, surface: c.surface, variant: c.variant, range: c.range, unit: c.unit, expectedRows: c.values.expectedRows, observedRows: c.values.observedRows.length, mismatches: c.values.mismatches.slice(0, 5) })),
  valueKeyboardFailures: cases.filter(c => c.values && c.values.expectedRows > 0 && !c.values.keyboardReachable).map(c => ({ browserName: c.browserName, surface: c.surface, variant: c.variant })),
  valueOverflowFailures: cases.filter(c => c.values?.overflow?.overflows).map(c => ({ browserName: c.browserName, surface: c.surface, variant: c.variant, range: c.range, ...c.values.overflow })) };
await writeFile(resolve(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ cases: summary.cases, errors: errors.length, reachableRecharts: summary.reachableRecharts, pointerMatches: summary.pointerMatches, pointerMismatches: summary.pointerMismatches.length, valuePoints: summary.valuePoints, valueParityPasses: summary.valueParityPasses, valueParityFailures: summary.valueParityFailures.length, valueOverflowFailures: summary.valueOverflowFailures.length }));
process.exitCode = errors.length || cases.some(c => c.pageErrors.length) ? 1 : 0;
