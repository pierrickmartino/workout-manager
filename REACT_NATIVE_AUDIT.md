# React Native Skills Audit — workout-manager

**Date:** 2026-09-30
**Ruleset:** `.claude/skills/vercel-react-native-skills` (35 rules)
**Scope audited:** `apps/web` (Next.js 16 / React 19), `apps/api` (FastAPI) where a rule's answer lives server-side

## Headline: the ruleset does not apply to this project

This repo contains **no React Native and no Expo**. Verified by four independent checks:

| Check | Result |
| --- | --- |
| `react-native` / `expo` / `reanimated` / `flash-list` / `@react-navigation/*` / `nativewind` in a `package.json` | none declared |
| `import … from 'react-native'` or `'expo…'` across all `.ts/.tsx/.js/.jsx` | zero occurrences |
| `app.json`, `app.config.*`, `metro.config.*`, `eas.json` | none present |
| `package.json` files in repo | exactly one, `apps/web` |

`apps/web` is a Next.js App Router **web** PWA (React 19, Clerk, Tailwind v4, Recharts).
`apps/api` is Python/FastAPI. There is no native target, so **21 of 35 rules are
structurally inapplicable** — they name APIs (`<Text>`, `StyleSheet`, `onLayout`,
`FlashList`, `expo-image`, `Gesture.Tap`, native navigators, Expo config plugins) that do
not exist in this codebase and cannot be adopted without adding a native app.

I audited the remaining **14 rules that are platform-agnostic React or have a direct web
analogue**. Results below. Nothing in this report is a defect found by the project's own
guards — it is this external ruleset applied to a web codebase it was not written for.

---

## Verdict summary

| # | Rule | Verdict | Severity |
| --- | --- | --- | --- |
| 1 | `rendering-no-falsy-and` | **PASS** — 0 violations | — |
| 2 | `react-state-dispatcher` | **PASS** — 0 violations | — |
| 3 | `react-state-minimize` | **PASS** | — |
| 4 | `state-ground-truth` | **PASS** | — |
| 5 | `js-hoist-intl` | **PASS** (no `Intl` use) + related note | INFO |
| 6 | `scroll-position-no-state` | **PASS** — no scroll position in state | — |
| 7 | `list-performance-item-memo` | **DEVIATION** — 0 `React.memo` in 116 components | MEDIUM |
| 8 | `list-performance-callbacks` | **DEVIATION** — unstable handler refs | MEDIUM (paired with #7) |
| 9 | `list-performance-virtualize` | **WATCH** — one unpaged list, bounded by design | LOW–MEDIUM |
| 10 | `imports-design-system-folder` | **DEVIATION** — 65 files import `lucide-react` directly | LOW |
| 11 | `react-state-fallback` | **DEVIATION** — 4 props-seeded `useState` | LOW |
| 12 | `monorepo-single-dependency-versions` | **PARTIAL** — caret ranges throughout | LOW |
| 13 | `design-system-compound-components` | **N/A in effect** — web-valid, see note | INFO |
| 14 | `react-compiler-destructure-functions` | **N/A** — React Compiler not enabled | INFO |

---

## Passes worth recording

**`rendering-no-falsy-and` — clean, and this is the ruleset's only CRITICAL rule.**
Searched every `.tsx` in `components/` and `app/` for `{expr && <…>}` including multiline
and parenthesized forms. Every conditional render in the codebase uses the
`cond ? <X /> : null` form. The 35 `&&` hits are boolean-logic chains inside validators
(`HandAuthoredSessionForm.tsx`, `AdhocLogForm.tsx`) and `while` loop conditions — not JSX.
The two that do sit in JSX (`builder/prescription-rows.tsx:831`,
`live-session-sets.tsx:69`) both terminate in `: null`.

Note the severity of this rule is RN-specific: on native a leaked `0` crashes the app; on
web it renders a stray `0`. The codebase is compliant either way, but **nothing enforces
it** — see the ESLint gap below.

**`react-state-dispatcher` — clean.** Zero instances of `setX(x + 1)` or `setX(!x)`.

**`react-state-minimize` / `state-ground-truth` — clean.** I traced all 12
`useEffect`-containing-`setState` sites, since that is the usual shape of a derived-state
antipattern. All 12 are legitimate: async fetches keyed on an id
(`exercise/catalog-detail.tsx:41`), debounced search with a staleness guard
(`ExerciseLibrary.tsx:49`), and timer-driven transition detection
(`SyncStatusBanner.tsx:47`). None mirrors a value derivable during render. The codebase
consistently derives with `useMemo` or plain expressions instead.

**`js-hoist-intl` — no `Intl` constructors anywhere**, so nothing to hoist.

*Related, not a rule violation:* 7 call sites use `toLocaleString` /
`toLocaleTimeString` (`SyncStatusBanner.tsx:199`, `pulse/level-badge.tsx:34-46`,
`pulse/resume-session-banner.tsx:25`, `app/admin/exercises/[id]/page.tsx:106`). Each call
constructs a formatter internally, which is the cost the rule exists to avoid. In
`level-badge.tsx` four such calls sit in one component body. Hoisting a module-scope
`Intl.NumberFormat` would remove that. Low impact at this scale — listed for completeness.

---

## Deviations

### MEDIUM — no memoized list items, and handler refs are unstable (#7, #8)

`React.memo` appears **zero times** across 116 components, against 158 `.map()` render
sites, 12 `useCallback`, and 19 `useMemo`.

These two rules have to be read together, and that is what makes this actionable rather
than a blanket "add memo". The clearest case is the exercise catalog:

- `components/ExerciseCatalogTaxonomy.tsx:283` maps `taxonomy.groups` → `PatternSection`,
  which in turn maps its own `exercises` — a nested list over the whole filtered catalog.
- `PatternSection` (declared line 317) is **not** memoized.
- It receives `onOpen={openDetail}` (line 291), and `openDetail` (line 154) is
  re-created on every parent render.

So adding `React.memo(PatternSection)` alone would buy nothing — the fresh `openDetail`
identity would defeat it on every render. The fix is the pair: wrap `PatternSection` in
`React.memo` **and** stabilise `openDetail` / `closeDetail` with `useCallback`. Either
change without the other is wasted.

Worth calibrating: on web, React's reconciler handles a few hundred rows without the
frame-drop cliff the RN rule is written against, and the parent re-renders here are driven
by filter changes that re-fetch anyway. Treat this as a scaling headroom item for the
catalog screen, not a live defect.

Files with the densest inline handler props, if this is pursued further:
`HandAuthoredSessionForm.tsx` (40), `builder/prescription-rows.tsx` (26),
`ProtocolBuilder.tsx` (26).

### LOW–MEDIUM — one deliberately unpaged list (#9)

`GET /exercises/taxonomy` (`apps/api/app/routes/exercises.py:228`) returns the **whole**
filtered catalog with no `limit`/`offset`, and `ExerciseCatalogTaxonomy` renders all of it.
Every sibling endpoint is paginated (`/exercises` at line 152, admin browse at line 492).

This is a documented decision, not an oversight — the docstring states: *"Unpaged: the
taxonomy needs the whole filtered set to group it, and the catalog is a bounded shared
set."* The reasoning holds: grouping by movement pattern requires the full set, and the
catalog is shared and curated rather than user-generated, so it does not grow per user.

No change recommended. Recording it as the one place in the app where the
virtualization rule would eventually have a web analogue (`react-window` or similar) if the
catalog ever stops being small. The bound is a product fact, not a code invariant, so it is
worth knowing it is load-bearing.

### LOW — third-party imports bypass the design-system folder (#10)

The project has a real design system at `components/pulse/` (36 components), which satisfies
the spirit of this rule for app-authored UI. But icons are imported straight from the
package: **65 files** contain `from "lucide-react"`, and there is no `components/pulse/index.ts`
barrel. `recharts` is better contained — 3 files, all chart components
(`exercise/top-set-trend-chart.tsx`, `pulse/volume-chart.tsx`, `pulse/distance-chart.tsx`),
which is consistent with ADR-0084 routing charts through classified imports.

Consequence: swapping or wrapping the icon set means touching 65 files. A one-line
re-export module would reduce that to one. Genuinely low priority — `lucide-react` is
stable and this is refactoring insurance, not a defect.

### LOW — four `useState` seeded from props (#11)

The rule prefers `useState<T | undefined>(undefined)` with `?? prop`, so the fallback stays
reactive if the prop changes:

- `AdminExerciseEditor.tsx:36` — `useState<ExerciseEditorFields>(initial)`
- `AdminExerciseCuration.tsx:124` — `useState(initial)`
- `ExerciseCatalogTaxonomy.tsx:77` — `useState<CatalogFilters>(initialFilters)`
- `ExerciseCatalogTaxonomy.tsx:78` — `useState<CatalogTaxonomy>(initialTaxonomy)`

The two in `ExerciseCatalogTaxonomy` are a **defensible deviation**, and the file says so:
the component is seeded once from the server (URL → `initialFilters`) and then deliberately
takes ownership, re-fetching on filter change and writing the URL with
`history.replaceState` specifically so the Server Component does *not* re-run. The props
are not expected to change, so there is no reactive fallback to preserve. Leave as is.

The two admin editors are worth a look on their own merits — if a server refetch can
deliver new `initial` values while the editor is mounted, the current code will show stale
fields.

### LOW — caret ranges on every dependency (#12)

The rule's "single version across packages" half is **moot**: there is one `package.json`,
so no cross-package drift is possible (`apps/api` is Python/`pyproject.toml`). Its "prefer
exact versions" half does apply — all 14 runtime and 22 dev dependencies use `^`, including
`next: ^16.2.6` and `react: ^19.0.0`. With no lockfile-pinned overrides, two installs at
different times can resolve differently. Standard practice for a web app and not a finding
I would push; noted because the rule is explicit about it.

---

## Notes on the two rules I marked N/A rather than judging

**`design-system-compound-components` (#13).** `components/ui/button.tsx` spreads
`...props` onto a `<button>`, so `<Button>Save</Button>` accepts a string child — which the
rule forbids in favour of `<Button><ButtonText>Save</ButtonText></Button>`. On React Native
that rule prevents a crash, because raw text outside `<Text>` throws. On web,
`<button>Save</button>` is correct HTML and there is no failure mode. The API-clarity
argument survives, but it is a style preference here, not a portable defect, and the
current `cva`-based variant API is coherent and idiomatic for the web. No change
recommended.

**`react-compiler-destructure-functions` (#14).** `next.config.js` sets only
`reactStrictMode: true`; `experimental.reactCompiler` is not enabled. The rule states it
applies only under the React Compiler, so it does not bind. Worth knowing the
codebase would need a destructuring pass before enabling the compiler, since dotting into
`props`/`router` inside handlers is common here — but that is a prerequisite for a change
nobody has proposed.

---

## The one thing I would actually fix, and it is not in the ruleset

`apps/web/package.json` declares `"lint": "next lint"`, but:

- there is **no ESLint config** anywhere in the repo (no `.eslintrc*`, no `eslint.config.*`
  at any depth outside `node_modules`), and
- **no `eslint` dependency** is declared in `package.json`.

So `npm run lint` cannot be doing what the script name claims. This matters directly to
this audit: the ruleset's one CRITICAL rule (`rendering-no-falsy-and`) ships with a lint
rule to enforce it — `react/jsx-no-leaked-render` — and there is no config to enable it in.
The codebase currently passes that rule by discipline alone, with nothing to stop a
regression.

This repo clearly prefers executable guards over convention — `terminology_guard.py`,
`skin-contrast-matrix.ts`, `accent-tint-policy.ts`, `faded-text-policy.ts`,
`chart-values-policy.ts`, `reflow-policy.ts`, `motion-policy.ts`, all gating in CI. A
codebase built that way having a `lint` script that resolves to nothing is the real gap,
and it is worth more than any deviation listed above.

Two options, in the grain of the project:

1. Add ESLint with `eslint-plugin-react` and enable `react/jsx-no-leaked-render`, or
2. Write a `lib/leaked-render-policy.ts` guard in the existing house style — sweeping every
   component, failing closed, with an exemption registry — matching the seven guards
   already in place.

Option 2 fits the established pattern better and needs no new toolchain. Either way, decide
what `npm run lint` is supposed to do, because right now it silently does nothing.

---

## How to reproduce

```bash
# applicability
grep -rEn "from ['\"](react-native|expo)" --include="*.ts" --include="*.tsx" apps/     # 0
find . -maxdepth 3 \( -name "app.json" -o -name "metro.config.*" -o -name "eas.json" \) \
  -not -path "*/node_modules/*"                                                        # none

# rule checks
grep -rEn "&& *\(?$|&& *<" --include="*.tsx" apps/web/components apps/web/app          # #1
grep -rEn "set[A-Z][A-Za-z]*\((![a-z][A-Za-z0-9_.]*|[a-z][A-Za-z0-9_.]* *[+-] )" \
  --include="*.tsx" apps/web/components apps/web/app                                   # #2
grep -rEn "new Intl\." --include="*.ts" --include="*.tsx" apps/web                     # #5
grep -rEc "React\.memo|= memo\(" --include="*.tsx" apps/web/components                 # #7
grep -rl 'from "lucide-react"' --include="*.tsx" apps/web/components | wc -l           # #10

# the lint gap
find . -maxdepth 3 \( -name ".eslintrc*" -o -name "eslint.config.*" \) \
  -not -path "*/node_modules/*"                                                        # none
grep -in eslint apps/web/package.json                                                  # none
```
