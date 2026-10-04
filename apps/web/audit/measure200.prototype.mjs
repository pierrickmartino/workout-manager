import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
await page.goto("http://127.0.0.1:4173/?journey=levels-visual&skin=pulse&mode=dark");
await page.waitForSelector("main[data-journey]");
await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const r = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, view: window.innerWidth,
  wide: [...document.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > 321)
    .slice(0, 8).map(e => ({ tag: e.tagName, cls: (e.className?.toString?.() ?? "").slice(0, 60), right: Math.round(e.getBoundingClientRect().right), text: (e.textContent ?? "").trim().slice(0, 30) })) }));
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: process.argv[2] + "/levels-visual-320-200pct.png", fullPage: true });
await browser.close();
