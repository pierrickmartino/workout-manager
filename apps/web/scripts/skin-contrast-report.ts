import { readFileSync } from "node:fs";
import { buildContrastMatrix, formatContrastReport } from "../lib/skin-contrast-matrix.ts";

// Offline evidence, deliberately not an enforcement command: known failures do
// not change the Text Ramp guard's scope or cause a nonzero exit status here.
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
process.stdout.write(formatContrastReport(buildContrastMatrix(css)));
