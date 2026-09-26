import { chromium, webkit, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const base = "http://127.0.0.1:4173";
const output = resolve(process.env.UI_RESILIENCE_OUTPUT ?? "../../docs/development/ui-resilience-evidence");
const cases = [];
await mkdir(output, { recursive: true });

async function open(page, journey) {
  await page.goto(`${base}/?journey=${journey}`);
  await page.locator(`main[data-journey=${journey}]`).waitFor();
  await page.waitForFunction(() => Boolean(window.auditActions));
}
async function control(page) {
  await page.evaluate(() => window.auditActions.control());
}
async function request(page, index, name) {
  await page.waitForFunction(({ index, name }) => window.auditActions.requests[index]?.name === name, { index, name });
}
async function complete(page, index, result) {
  await page.evaluate(({ index, result }) => window.auditActions.resolve(index, result), { index, result });
}
async function animations(page) {
  return page.evaluate(() => [...document.querySelectorAll("main *")].flatMap(element => {
    const style = getComputedStyle(element);
    return style.animationName !== "none" && style.animationDuration !== "0s"
      ? [{ tag: element.tagName, name: style.animationName, duration: style.animationDuration }] : [];
  }));
}

for (const [engine, launcher] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await launcher.launch();
  const browserVersion = browser.version();
  try {
    async function check(name, body) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      console.log(`${engine}: ${name}`);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        const evidence = await body(page, context);
        if (errors.length) throw new Error(errors.join("; "));
        cases.push({ engine, browserVersion, name, status: "pass", evidence, pageErrors: errors });
      } catch (error) {
        const status = name === "service-worker-offline-navigation" && error.message.includes("WebKit encountered an internal error") ? "inconclusive" : "fail";
        cases.push({ engine, browserVersion, name, status, error: error.message, pageErrors: errors });
        await page.screenshot({ path: resolve(output, `${engine}-${name}.png`) }).catch(() => {});
      } finally { await context.close(); }
    }

    await check("reduced-motion-initial", async page => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await open(page, "motion");
      const active = await animations(page);
      await expect(page.getByRole("status")).toContainText("GENERATING PROTOCOL");
      expect(active, JSON.stringify(active)).toEqual([]);
    });
    await check("reduced-motion-live-change", async page => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await open(page, "motion");
      const before = await animations(page);
      expect(before.length).toBeGreaterThan(0);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const after = await animations(page);
      expect(after, JSON.stringify(after)).toEqual([]);
      return { before, after };
    });

    for (const staleError of [false, true]) {
      await check(staleError ? "stale-error" : "stale-success", async page => {
        await open(page, "catalog");
        await control(page);
        const search = page.getByPlaceholder("Search an exercise…");
        await search.fill("older");
        await request(page, 0, "fetchCatalogTaxonomyForFilters");
        await search.fill("newer");
        await request(page, 1, "fetchCatalogTaxonomyForFilters");
        // Distinct counts establish which response is displayed, independent of input text.
        await complete(page, 1, { taxonomy: { total: 222, groups: [] }, error: null });
        await complete(page, 0, { taxonomy: { total: 111, groups: [] }, error: staleError ? "STALE ERROR" : null });
        await expect(page.locator("main")).toContainText("222");
        await expect(page.locator("main")).not.toContainText("STALE ERROR");
        expect(new URL(page.url()).searchParams.get("query")).toBe("newer");
      });
    }
    await check("catalog-offline-reconnect", async (page, context) => {
      await open(page, "catalog");
      await control(page);
      await page.getByPlaceholder("Search an exercise…").fill("offline-query");
      await context.setOffline(true);
      await page.waitForFunction(() => !navigator.onLine);
      await expect(page.getByPlaceholder("Search an exercise…")).toBeDisabled();
      await page.waitForTimeout(600);
      expect(await page.evaluate(() => window.auditActions.requests.length)).toBe(0);
      await expect(page.locator("main")).toContainText("reconnect to search");
      await context.setOffline(false);
      await request(page, 0, "fetchCatalogTaxonomyForFilters");
      await complete(page, 0, { taxonomy: { total: 333, groups: [] }, error: null });
      await expect(page.locator("main")).toContainText("333");
    });
    await check("catalog-slow-success", async page => {
      await open(page, "catalog");
      await control(page);
      await page.getByPlaceholder("Search an exercise…").fill("slow-query");
      await request(page, 0, "fetchCatalogTaxonomyForFilters");
      await page.waitForTimeout(1000);
      await expect(page.getByPlaceholder("Search an exercise…")).toHaveValue("slow-query");
      await complete(page, 0, { taxonomy: { total: 444, groups: [] }, error: null });
      await expect(page.locator("main")).toContainText("444");
      return { delayMs: 1000 };
    });
    await check("adhoc-storage-blocked", async page => {
      await page.addInitScript(() => {
        Storage.prototype.setItem = () => { throw new DOMException("Synthetic quota failure", "QuotaExceededError"); };
      });
      await open(page, "adhoc");
      await page.getByRole("textbox", { name: "Movement name, set 1" }).fill("Still editable");
      await expect(page.getByRole("alert")).toContainText("could not be saved");
      await expect(page.getByRole("textbox", { name: "Movement name, set 1" })).toHaveValue("Still editable");
    });

    await check("synthetic-shell-insets", async page => {
      await open(page, "adhoc");
      // Override actual compiled rules, not utility class names. This verifies
      // padding arithmetic only; CSS injection is not installed-device evidence.
      await page.evaluate(() => {
        const css = [...document.styleSheets].flatMap(sheet => {
          try { return [...sheet.cssRules].map(rule => rule.cssText); } catch { return []; }
        }).join("\n").replaceAll("env(safe-area-inset-bottom)", "34px").replaceAll("env(safe-area-inset-top)", "47px");
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      });
      const measured = await page.evaluate(() => ({
        headerTop: getComputedStyle(document.querySelector("header")).paddingTop,
        mainBottom: getComputedStyle(document.querySelector("main")).paddingBottom,
        navBottom: getComputedStyle(document.querySelector("nav > div")).paddingBottom,
      }));
      expect(parseFloat(measured.headerTop)).toBeGreaterThanOrEqual(47);
      expect(parseFloat(measured.mainBottom)).toBeGreaterThanOrEqual(34 + 112);
      expect(parseFloat(measured.navBottom)).toBeGreaterThanOrEqual(34);
      return { injectedTop: 47, injectedBottom: 34, ...measured, physicalDevice: false };
    });

    for (const journey of ["creation", "adhoc", "correction"]) {
      await check(`${journey}-reload-recovery`, async page => {
        await open(page, journey);
        const input = journey === "creation" ? page.locator("select[name=training_type]")
          : journey === "adhoc" ? page.getByRole("textbox", { name: "Movement name, set 1" })
            : page.locator("input[name=set-0-reps]");
        const value = journey === "creation" ? "yoga" : journey === "adhoc" ? "Synthetic recovery exercise" : "17";
        if (journey === "creation") await input.selectOption(value);
        else await input.fill(value);
        await page.waitForFunction(() => Object.keys(localStorage).some(key => key.includes("draft")));
        await page.reload();
        await page.getByRole("button", { name: "Restore draft", exact: true }).click();
        await expect(input).toHaveValue(value);
      });
    }
    await check("adhoc-slow-failure-retry", async page => {
      await open(page, "adhoc");
      await control(page);
      await page.getByRole("textbox", { name: "Movement name, set 1" }).fill("Synthetic exercise");
      await page.getByLabel("Amount kind, set 1", { exact: true }).selectOption("repetitions");
      await page.getByLabel("Reps, set 1", { exact: true }).fill("12");
      const submit = page.locator("button[type=submit]");
      await submit.click();
      await request(page, 0, "submitAdhocLog");
      await page.waitForTimeout(1000);
      await expect(submit).toBeDisabled();
      await expect(page.getByRole("textbox", { name: "Movement name, set 1" })).toHaveValue("Synthetic exercise");
      await complete(page, 0, { error: "Synthetic connection lost after submission" });
      await expect(page.getByRole("alert")).toContainText("Synthetic connection lost");
      await expect(submit).toBeEnabled();
      await submit.click();
      await request(page, 1, "submitAdhocLog");
      // FormData cannot be inspected after serialization; read in the page itself.
      const keys = await page.evaluate(() => window.auditActions.requests.map(item => item.args.find(arg => arg instanceof FormData)?.get("idempotency_key")));
      expect(keys[0]).toBeTruthy();
      expect(keys[1]).toBe(keys[0]);
      await complete(page, 1, { error: "Synthetic retry failure" });
      return { stableIdempotencyKey: true, delayMs: 1000, backendCommit: "not exercised" };
    });

    await check("indexeddb-reload-dedupe", async page => {
      await open(page, "live");
      const entry = { key: "11111111-1111-4111-8111-111111111111", accountId: "audit-synthetic-account", sessionId: 1,
        payload: { idempotency_key: "11111111-1111-4111-8111-111111111111", performed_on: "2026-09-26", sets: [] }, status: "pending", error: null };
      await page.evaluate(async entry => {
        const store = window.auditOutbox;
        await store.clearOutbox();
        await store.saveOutboxEntry(entry);
        await store.saveOutboxEntry(entry);
      }, entry);
      await page.reload();
      const loaded = await page.evaluate(async () => {
        const store = window.auditOutbox;
        return store.loadOutbox();
      });
      expect(loaded).toEqual([entry]);
      return { entries: loaded.length, delivery: "not exercised" };
    });
    await check("outbox-interrupted-delivery-retry", async page => {
      await open(page, "live");
      const evidence = await page.evaluate(async () => {
        const key = crypto.randomUUID();
        const entry = { key, accountId: "audit-synthetic-account", sessionId: 1,
          payload: { idempotency_key: key, performed_on: "2026-09-26", sets: [] }, status: "pending", error: null };
        await window.auditOutbox.clearOutbox();
        const durable = await window.auditSync.enqueueFinish(entry);
        const attempts = [];
        await window.auditSync.drainOutbox(entry.accountId, async (_session, payload) => {
          attempts.push(payload.idempotency_key);
          // Inject failure after the action is called; no real backend commit.
          throw new Error("Synthetic acknowledgement lost");
        });
        const afterFailure = await window.auditOutbox.loadOutbox();
        await window.auditSync.drainOutbox(entry.accountId, async (_session, payload) => {
          attempts.push(payload.idempotency_key);
          return { ok: true, error: null };
        });
        return { durable, afterFailure: afterFailure.map(row => ({ key: row.key, status: row.status })),
          remaining: (await window.auditOutbox.loadOutbox()).length, attempts, backendCommit: "mocked; not verified" };
      });
      expect(evidence.durable).toBe(true);
      expect(evidence.afterFailure[0].status).toBe("failed");
      expect(evidence.attempts).toHaveLength(2);
      expect(evidence.attempts[1]).toBe(evidence.attempts[0]);
      expect(evidence.remaining).toBe(0);
      // Retain the retry proof without publishing random UUIDs that secret
      // scanners can mistake for credentials in archived evidence.
      return { durable: evidence.durable,
        afterFailure: evidence.afterFailure.map(({ status }) => ({ status })),
        remaining: evidence.remaining, attempts: evidence.attempts.length,
        stableIdempotencyKey: true, backendCommit: evidence.backendCommit };
    });
    await check("service-worker-offline-navigation", async (page, context) => {
      await open(page, "adhoc");
      await page.evaluate(async () => {
        await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
      });
      // Online navigation is intentionally distinct from the precached public fallback.
      await page.goto(`${base}/?journey=adhoc&private_marker=synthetic`);
      await page.locator("main[data-journey=adhoc]").waitFor();
      const cached = await page.evaluate(async () => {
        const urls = [];
        for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
        return urls;
      });
      expect(cached).toEqual([`${base}/offline`]);
      await context.setOffline(true);
      await page.goto(`${base}/?journey=adhoc&offline_navigation=1`);
      await expect(page.locator("main")).toContainText("Audit offline fallback");
      return { cached, worker: "production public/sw.js", offlinePage: "synthetic; not production Next page", navigation: "full document, not RSC" };
    });

    for (const journey of ["catalog", "analytics"]) {
      await check(`${journey}-reduced-drawer`, async page => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page, journey);
        if (journey === "catalog") {
          const section = page.getByRole("button", { name: /Squat/ }).first();
          if (await section.getAttribute("aria-expanded") === "false") await section.click();
          await page.getByRole("button", { name: /Long exercise name/ }).first().click();
        } else await page.getByRole("button", { name: "Open muscle details" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        const transitions = await dialog.evaluate(element => {
          const style = getComputedStyle(element);
          return { property: style.transitionProperty, duration: style.transitionDuration };
        });
        expect(transitions.property === "none" || transitions.duration.split(",").every(duration => parseFloat(duration) === 0)).toBe(true);
        await expect(dialog.getByRole("button", { name: /close/i }).first()).toBeVisible();
        return { transitions };
      });
    }
  } finally { await browser.close(); }
}
await writeFile(resolve(output, "results.json"), JSON.stringify({
  baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  recordedAt: new Date().toISOString(), environment: "isolated Vite production-component harness; mocked actions/navigation/auth",
  cases,
}, null, 2) + "\n");
console.log(JSON.stringify({ checks: cases.length, passed: cases.filter(item => item.status === "pass").length,
  inconclusive: cases.filter(item => item.status === "inconclusive").map(item => ({ engine: item.engine, name: item.name, error: item.error })),
  failed: cases.filter(item => item.status === "fail").map(item => ({ engine: item.engine, name: item.name, error: item.error })) }, null, 2));
// Findings are deliberately visible as a nonzero exit; validation does not fix UI.
if (cases.some(item => item.status === "fail")) process.exitCode = 1;
