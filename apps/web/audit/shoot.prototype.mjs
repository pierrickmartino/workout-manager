import { chromium } from "@playwright/test";

const base = "http://127.0.0.1:4173";
const out = process.argv[2] ?? ".";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

for (const [name, width, skin, mode] of [
  ["levels-visual-320-pulse-dark", 320, "pulse", "dark"],
  ["levels-visual-390-pulse-dark", 390, "pulse", "dark"],
  ["levels-visual-390-vercel-light", 390, "vercel", "light"],
  ["levels-visual-1440-pulse-dark", 1440, "pulse", "dark"],
]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/?journey=levels-visual&skin=${skin}&mode=${mode}`);
  await page.waitForSelector("main[data-journey]");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    view: window.innerWidth,
  }));
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log(name, JSON.stringify(overflow), errors.length ? `ERRORS: ${errors.join("; ")}` : "clean");
  await page.close();
}
await browser.close();
