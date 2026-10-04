import { chromium } from "@playwright/test";
const base = "http://127.0.0.1:4173";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const journey = process.argv[2] ?? "levels-visual";
const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
await page.goto(`${base}/?journey=${journey}&skin=pulse&mode=dark`);
await page.waitForSelector("main[data-journey]");
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const wide = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.right > 321 || r.width > 320) {
      out.push({ tag: el.tagName, cls: (el.className?.toString?.() ?? "").slice(0, 90), w: Math.round(r.width), right: Math.round(r.right), text: (el.textContent ?? "").trim().slice(0, 40) });
    }
  }
  return out.slice(0, 25);
});
console.log(journey, JSON.stringify(wide, null, 1));
await browser.close();
