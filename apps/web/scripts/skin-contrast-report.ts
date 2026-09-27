import { readFileSync } from "node:fs";
import { buildContrastMatrix, formatContrastReport } from "../lib/skin-contrast-matrix.ts";

// Offline written evidence. CI enforcement lives in skin-contrast.test.ts;
// this reporting command keeps its exit status independent of measured failures.
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
process.stdout.write(formatContrastReport(buildContrastMatrix(css)));
