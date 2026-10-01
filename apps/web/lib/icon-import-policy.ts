import { moduleSpecifiers, type ModuleSpecifier } from "./module-specifiers.ts";

// ADR-0092 made executable: the icon set is reached through the design system, never from
// the package.
//
// `components/pulse/` is a real design system — 36 components the app composes instead of
// styling raw elements. Icons were the hole in it: 66 files named `lucide-react` directly,
// so an icon was the one piece of design-system surface a component could take without
// going through `pulse/`. The cost of that is paid at the moment someone wants to wrap the
// set (a default size, a stroke width, a `aria-hidden` default) or replace it — 66 files
// instead of one.
//
// The rule: exactly one module may name `lucide-react`, and that module is
// `components/pulse/icons.ts`. Everything else imports from there. That is a source
// property — which file names which module in an import declaration — so this module reads
// source, like `recharts-import-policy`, `chart-values-policy` and `motion-policy` before
// it. Given one file's text it returns the violations that file declares; sweeping the tree
// is the caller's job (see icon-import-policy.test.ts), which keeps this module pure.
//
// **Fails closed.** The check is "does this file import the package", not "does it import a
// known icon" — so a new icon, a renamed export, or a deep import
// (`lucide-react/dist/esm/icons/plus`) is caught without this guard knowing the set. A
// type-only import is *not* exempt here, unlike in `recharts-import-policy`: `LucideIcon`
// costs no bytes, but naming it from the package is the same coupling this rule exists to
// remove, and `components/pulse/icons.ts` re-exports the type for that reason.
//
// **What this guard proves, and what it does not.** It proves no module outside the design
// system names the icon package. It does not prove the barrel is weightless — that is a
// build property. Next.js rewrites named `lucide-react` imports to per-icon modules
// (`optimizePackageImports`) and these are pure re-exports, which is why the measurement
// taken when this landed showed no route's client chunk weight moving; measuring
// `.next/server/app/<route>/page_client-reference-manifest.js` is still the procedure
// CLAUDE.md prescribes for a claim about bytes.

// The one module allowed to name the package.
export const ICON_MODULE = "components/pulse/icons.ts";

// The specifier every other module imports icons from.
export const ICON_SPECIFIER = "@/components/pulse/icons";

export interface IconImportExemption {
  readonly file: string;
  readonly reason: string;
}

// Deliberately empty. An entry here asserts that one more file must be edited every time
// the icon set is wrapped or replaced, which needs a reason a reviewer can weigh — so the
// reason is a required field, not a comment.
export const ICON_IMPORT_EXEMPTIONS: readonly IconImportExemption[] = [];

export interface IconImportViolation {
  readonly file: string;
  readonly line: number;
  // The specifier as written, so a deep import reads as itself in the failure message.
  readonly specifier: string;
}

// Every module this file names, import or re-export, from the shared AST walk — so a package
// name inside a comment or a string never counts. Both forms count here, unlike in
// `recharts-import-policy`: a second barrel re-exporting the package is the loophole an
// import-only check would leave open.
export function importedSpecifiers(
  source: string,
  file: string,
): readonly ModuleSpecifier[] {
  return moduleSpecifiers(source, file);
}

// Whether a specifier names the icon package at all — the bare package or any path inside
// it. Matching the prefix rather than the exact string is what makes a deep import a
// violation instead of a loophole.
export function namesIconPackage(specifier: string): boolean {
  return specifier === "lucide-react" || specifier.startsWith("lucide-react/");
}

export function findIconImportViolations(
  source: string,
  file: string,
): readonly IconImportViolation[] {
  // The design system's own icon module is the point of the rule, not an exception to it.
  if (file === ICON_MODULE) return [];
  if (ICON_IMPORT_EXEMPTIONS.some((exemption) => exemption.file === file)) return [];

  return importedSpecifiers(source, file)
    .filter(({ specifier }) => namesIconPackage(specifier))
    .map(({ specifier, line }) => ({ file, line, specifier }));
}

export function formatIconImportViolations(
  violations: readonly IconImportViolation[],
): string {
  return violations
    .map(({ file, line, specifier }) =>
      `${file}:${line} — imports "${specifier}" directly, so the icon set cannot be ` +
      `wrapped or replaced without editing this file too; import from "${ICON_SPECIFIER}" ` +
      `and add the icon to ${ICON_MODULE} if it is not re-exported yet (ADR-0092)`)
    .join("\n");
}
