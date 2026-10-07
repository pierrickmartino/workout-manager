// Trusted Types report-only probe (ADR-0036). Loads pages under
// `require-trusted-types-for 'script'` and prints every violation as JSON.
//
// Harness mode (default): mounts each audit/ journey from `npm run audit:serve` and adds the
// report-only header itself, since Vite serves none. This measures React and our components.
//
//   node audit/trusted-types.mjs
//
// Server mode: points at a running `next start`, whose proxy.ts already sends the header,
// so Clerk's injected scripts and the service-worker registration are measured too.
//
//   UI_TT_BASE=http://127.0.0.1:3000 UI_TT_PATHS=/,/sign-in,/sign-up node audit/trusted-types.mjs
import { chromium } from "@playwright/test";

const HARNESS_JOURNEYS = ["charts", "motion", "adhoc", "correction", "profile", "sessions", "history", "catalog",
  "creation", "creation-logged", "logging", "live", "analytics", "home", "exercise", "admin", "confirm", "sheet",
  "launchpad", "levels"];
const base = process.env.UI_TT_BASE;
const isServer = Boolean(base);
const targets = isServer
  ? (process.env.UI_TT_PATHS ?? "/").split(",").map(path => ({ name: path, url: new URL(path, base).href }))
  : HARNESS_JOURNEYS.map(journey => ({ name: journey, url: `http://127.0.0.1:4173/?journey=${journey}` }));

const browser = await chromium.launch({ executablePath: process.env.UI_CHROMIUM_EXECUTABLE || undefined });
const page = await browser.newPage();
if (!isServer) {
  await page.route("**/*", async route => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy-report-only": "require-trusted-types-for 'script'" } });
  });
}
await page.addInitScript(() => {
  window.__trustedTypesViolations = [];
  document.addEventListener("securitypolicyviolation", event => window.__trustedTypesViolations.push({
    directive: event.effectiveDirective, sample: event.sample, source: event.sourceFile, line: event.lineNumber }));
});

const results = {};
for (const { name, url } of targets) {
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on("pageerror", onError);
  await page.goto(url, { waitUntil: "networkidle" });
  // Exercise the client a little: open every <details>, press the first few buttons.
  await page.evaluate(() => document.querySelectorAll("details").forEach(details => { details.open = true; }));
  const buttons = page.locator("main button:visible");
  for (let i = 0; i < Math.min(await buttons.count(), 4); i++) await buttons.nth(i).click({ timeout: 1000 }).catch(() => {});
  await page.waitForTimeout(300);
  results[name] = { violations: await page.evaluate(() => window.__trustedTypesViolations), errors };
  page.off("pageerror", onError);
}
await browser.close();

const total = Object.values(results).reduce((sum, result) => sum + result.violations.length, 0);
console.log(JSON.stringify({ mode: isServer ? "server" : "harness", total, results }, null, 2));
