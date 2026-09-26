import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const web = resolve(import.meta.dirname, "..");
// These replacements exist only in this separate, loopback-only audit server.
// Production Next builds never load this config or expose these fixtures.
export default defineConfig({
  root: import.meta.dirname,
  publicDir: resolve(web, "public"),
  plugins: [
    {
      name: "isolated-server-boundaries",
      enforce: "pre",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split("?")[0] !== "/offline") return next();
          res.setHeader("Content-Type", "text/html");
          res.end("<!doctype html><title>Audit offline fixture</title><main>Audit offline fallback — synthetic public page</main>");
        });
      },
      resolveId(id) {
        if ((id.startsWith("@/app/") || id.startsWith(`${web}/app/`)) && /action/.test(id)) {
          const path = id.startsWith("@/") ? resolve(web, id.slice(2)) : id;
          return `\0audit:${path.endsWith(".ts") ? path : path + ".ts"}`;
        }
      },
      load(id) {
        if (!id.startsWith("\0audit:")) return;
        const path = id.slice("\0audit:".length);
        const source = readFileSync(path, "utf8");
        const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(match => match[1]);
        return `import { actionResult } from '/boundaries.tsx';\n` + names.map(name =>
          `export const ${name} = async (...args) => actionResult(${JSON.stringify(name)}, args);`,
        ).join("\n");
      },
    },
    react(), tailwind(),
  ],
  resolve: { alias: [
    { find: "next/navigation", replacement: resolve(import.meta.dirname, "boundaries.tsx") },
    { find: "next/link", replacement: resolve(import.meta.dirname, "link.tsx") },
    { find: "@clerk/nextjs", replacement: resolve(import.meta.dirname, "boundaries.tsx") },
    { find: "@", replacement: web },
  ] },
  server: { host: "127.0.0.1", port: 4173, strictPort: true, fs: { allow: [web] } },
});
