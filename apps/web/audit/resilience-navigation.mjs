// Real Next navigation probe. Requires a locally running app with synthetic data
// and an existing disposable account's Playwright storage state; never prints it.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = process.env.UI_REAL_APP_URL;
const storageState = process.env.UI_REAL_APP_STORAGE_STATE;
if (!base || !storageState) throw new Error("Set UI_REAL_APP_URL and UI_REAL_APP_STORAGE_STATE for a disposable test account. See audit/README.md.");
const origin = new URL(base);
if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("This probe requires a loopback test app.");
const output = resolve(process.env.UI_REAL_APP_OUTPUT ?? "../../docs/development/ui-resilience-evidence/real-app");
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  const context = await browser.newContext({ storageState });
  for (const [path, placeholder, query] of [
    ["/exercises", "Search an exercise…", "squat"],
    ["/sessions", "Search by name or type", "strength"],
    ["/history", "Any exercise", "squat"],
  ]) {
    const page = await context.newPage();
    try {
      await page.goto(new URL(path, origin).href);
      const field = page.getByPlaceholder(placeholder);
      await field.fill(query);
      await expect.poll(() => new URL(page.url()).search).not.toBe("");
      const filteredUrl = page.url();
      await page.reload();
      await expect(field).toHaveValue(query);
      await expect(page).toHaveURL(filteredUrl);
      // Full navigation and browser history exercise real Next seeding; the
      // separate manual checklist covers client links/detail-return behavior.
      await page.goto(new URL("/profile", origin).href);
      await page.goBack();
      await expect(field).toHaveValue(query);
      await expect(page).toHaveURL(filteredUrl);
      await page.goForward();
      await expect(page).toHaveURL(new URL("/profile", origin).href);
      results.push({ path, status: "pass" });
    } catch (error) {
      // No screenshot or DOM dump: even a disposable authenticated page may
      // contain account data. Evidence records only the scenario and outcome.
      results.push({ path, status: "fail", error: error.name });
    } finally { await page.close(); }
  }
  await context.close();
} finally { await browser.close(); }
await writeFile(resolve(output, "navigation.json"), JSON.stringify({ browser: "chromium", results }, null, 2) + "\n");
console.log(JSON.stringify(results));
if (results.some(result => result.status === "fail")) process.exitCode = 1;
