// Snapshot next/font's emitted faces and bytes, never a substitute font package.
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";

const cssPath = resolve(process.argv[2] ?? ".next/dev/static/css/app/layout.css");
const mediaPath = resolve(process.argv[3] ?? ".next/dev/static/media");
const css = await readFile(cssPath, "utf8");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const faces = [...css.matchAll(/@font-face\s*\{[^}]+\}/g)].map(match => match[0]);
const variables = [...css.matchAll(/--font-([\w-]+):\s*(["'][^;{}]+)\s*[;}]/g)]
  .filter(match => !["sans", "mono", "display"].includes(match[1]));
if (!faces.length || new Set(variables.map(match => match[1])).size !== 7) {
  throw new Error("Expected all seven app/layout.tsx next/font handles");
}
const fontFile = url => basename(url.replace(/^["']|["']$/g, ""));
const assets = [...new Set(faces.flatMap(face => [...face.matchAll(/url\(([^)]+)\)/g)].map(match => fontFile(match[1]))))];
await mkdir("audit/production-fonts", { recursive: true });
const files = await Promise.all(assets.map(async file => {
  const bytes = await readFile(resolve(mediaPath, file));
  await copyFile(resolve(mediaPath, file), resolve("audit/production-fonts", file));
  return { file, bytes: bytes.length, sha256: hash(bytes) };
}));
const fontCss = faces.join("\n").replaceAll(/url\(([^)]+)\)/g, (_, url) => `url("./production-fonts/${fontFile(url)}")`)
  + "\n:root {\n" + variables.map(match => `  --font-${match[1]}: ${match[2].trim()};`).join("\n") + "\n}\n";
await writeFile("audit/fonts.css", "/* Emitted by next/font for app/layout.tsx; regenerate with capture-fonts.mjs. */\n" + fontCss);
await writeFile("audit/production-fonts/manifest.json", JSON.stringify({
  source: "next/font loader output for app/layout.tsx", cssSource: cssPath.split("/apps/web/")[1],
  layoutSha256: hash(await readFile("app/layout.tsx")), files,
}, null, 2) + "\n");
console.log(`Captured ${files.length} Next font payloads`);
