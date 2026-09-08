# Design Critique — Mobile (Aurora · Light)

> An `impeccable critique`-style review of the `apps/web` PWA, run against
> real mobile screenshots and cross-referenced to source. It evaluates the
> axes Impeccable's `critique` covers — **UX · hierarchy · cognitive load ·
> brand fit · anti-patterns** — plus **accessibility**, **data-viz
> correctness**, and **content/terminology**.

**Method.** Visual critique of 8 captured screens (Train, Analytics, Dashboard,
Profile, My Sessions, Session detail, Catalog, Exercise detail), each anchored
to the component/token that produces it. Findings that name a file/line are
verified against the code; findings phrased as "appears/reads as" are
observed from the render and flagged to confirm.

**Caveat.** This is an *emulation* of the workflow, not the real detector, and
the captures are single-state (one user, light mode, Aurora skin). Interaction,
motion, and dark mode were reasoned about from code, not seen.

**What the render confirms.** The "operator / tactical command-center" identity
is strong and consistent across every screen; the app reads as *shipped*, not
prototyped. The domain's honest-data ethos (plan ≠ record, no fabricated zeros)
shows up directly in the UI. The issues below cluster in three layers:
**content/data trust**, **accessibility (contrast + type)**, and **tonal
restraint** — not architecture.

---

## Severity summary

| # | Finding | Where | Category | Severity |
|---|---------|-------|----------|----------|
| 1 | `TRAINED · last {label}` prints "last last week" / "last this week" / "last today" | Catalog | Content · Correctness | **HIGH** |
| 2 | Misleading % deltas (**+3679%**, +529%) from near-zero baselines | Analytics | Trust · Data honesty | **HIGH** |
| 3 | Volume line chart Y-axis reads non-monotonic (8000→9500→0) | Analytics | Data-viz correctness | **HIGH** |
| 4 | Low-contrast grey-mono labels below WCAG AA | All | Accessibility | **HIGH** |
| 5 | Smallest type carries the weakest contrast (9px/7px muted) | All | Accessibility | **HIGH** |
| 6 | "CAUTION" readiness badge rendered in **violet**, not amber | Dashboard | Color semantics | **MEDIUM** |
| 7 | Internal taxonomy (`LISTABLE`, `STUB`) shown as user-facing pills | Catalog | Content · Cognitive load | **MEDIUM** |
| 8 | Badge overload — up to 3 status pills per catalog row | Catalog | Cognitive load | **MEDIUM** |
| 9 | Terminology drift: "exercise" vs "movement" used interchangeably | Train · Catalog · Session | Terminology | **MEDIUM** |
| 10 | Continuous animations skip `prefers-reduced-motion` | Global | Accessibility · harden | **MEDIUM** |
| 11 | Body paragraph set in **monospace** | Train | Readability | **MEDIUM** |
| 12 | Training heatmap reads empty + "**Hover** or focus" hint on touch | Profile | Data-viz · Mobile | **MEDIUM** |
| 13 | Many equal-weight filled "START" buttons compete | Train | Hierarchy | **MEDIUM** |
| 14 | Muscle-split bars too thin/faint to compare | Analytics | Data-viz | **MEDIUM** |
| 15 | Sub-44px tap targets in a touch shell | Global | Accessibility (mobile) | **MEDIUM** |
| 16 | Equipment data hygiene: `barbell`/`barbells` dup, mixed casing | Catalog | Data quality | **LOW** |
| 17 | "0 TOTAL SETS" hero on a never-performed exercise | Exercise detail | Consistency | **LOW** |
| 18 | Inconsistent title casing (`strength · 2026-09-05` vs `Calisthenics`) | Train · Sessions | Polish | **LOW** |
| 19 | "BY PIERRICK" repeated on every session card | My Sessions | Cognitive load | **LOW** |
| 20 | ~28 decorative icons without `aria-hidden` | Global | Accessibility | **LOW** |

---

## Content, copy & terminology

### 1 · "last last week" — recency label collision — **HIGH**

`components/ExerciseCatalogBrowser.tsx:377` renders:

```tsx
<span …>TRAINED · last {label}</span>
```

but `label` comes from `recencyLabel()` in `lib/exercise-usage-view.ts`, which
already returns self-contained phrases: `"today"`, `"this week"`, `"last week"`,
`"N wks ago"`. The hardcoded `last ` prefix collides with them, so the Catalog
shows **"TRAINED · LAST LAST WEEK"**, **"TRAINED · LAST THIS WEEK"**, and
**"TRAINED · LAST TODAY"**. Only `"N wks ago"` reads acceptably. On a screen
whose whole point is honest, descriptive recency (ADR-0042), the phrasing looks
buggy.

**Fix:** drop the prefix — `TRAINED · {label}` — since the phrases are already
complete. (If a "last trained" framing is wanted, move it into `recencyLabel`
so it composes correctly for every branch, including `today`.)

### 7 · Internal taxonomy leaks into the UI — **MEDIUM**

Catalog rows wear `LISTABLE` and `STUB` pills
(`lib/exercise-completeness.ts:39,44`, ADR-0041 Completeness tiers). These are
*content-pipeline states*, not concepts a trainer thinks in — "Stub" especially
reads as developer jargon. Mixed with `CURATED` / `AI-GEN` / `NEW` / `TRANED`,
a user can't tell which badges are for *them*.

**Fix:** hide `LISTABLE`/`STUB` from end users (or gate behind an admin/debug
view). Keep the badges that carry user meaning — provenance (`CURATED` /
`AI-GEN`) and `NEW` / `TRAINED`.

### 8 · Badge overload — **MEDIUM**

Several catalog rows carry **three** status pills (e.g. `AI-GEN · LISTABLE ·
NEW`) above a truncated muscle list. That's four competing signals per row
before the movement name has landed. **Fix:** cap at one provenance + one state
badge per row; fold the rest into the detail view.

### 9 · "Exercise" vs "movement" drift — **MEDIUM**

The same concept is named two ways across the flow: nav/title "Browse
**exercises**" and the "**EXERCISES**" dashboard stat, vs. "107 **MOVEMENTS**",
"Search a **movement**", and — on Session detail — two near-identical CTAs,
**"Add exercise"** and **"Add movement"**. This repo has a terminology *law*
(`CONTEXT.md`, `app/quality/terminology_guard.py`); the UI should honor it.

**Fix:** pick one user-facing term and apply it everywhere; if "Add exercise"
and "Add movement" are genuinely different actions, rename so the difference is
legible (e.g. "Add from catalog" vs "Add custom movement").

---

## Data trust & visualization (Analytics)

### 2 · Misleading percentage deltas — **HIGH**

Analytics opens with **"+3679% vs. previous 30D"** (Total Volume) and
**"+529%"** (Weekly Distance). Deltas this large almost always mean the prior
window was ~zero — true, but they read as a vanity metric or a bug, and they're
the very first thing on the screen. For an app built on honest data, a +3679%
hero is off-brand. **Fix:** suppress or cap the delta when the baseline is below
a threshold ("first full month", or an absolute figure) instead of printing a
four-digit percentage.

### 3 · Volume chart Y-axis looks broken — **HIGH**

On the Total Volume line chart the Y ticks read, top-to-bottom, roughly
**8000 · 8500 · 9000 · 9500 · 0** — non-monotonic, with `0` stranded at the
bottom. `components/pulse/volume-chart.tsx` is itself clean, so this is a
**domain problem**: a near-flat series (~8–9.5k) plus a zero day yields a
nonsense axis, making the panel look untrustworthy. **Fix:** set an explicit
`YAxis domain={[0, 'auto']}` with a controlled tick count, and decide how
zero-volume days enter the series (`lib/volume-view`).

### 14 · Muscle-split bars can't be compared — **MEDIUM**

`components/pulse/muscle-split.tsx` renders `h-1.5` (6px) faint tracks; the
*number* does all the encoding while the bar barely reads (LEGS 10% vs ARMS 19%
are hard to tell apart). `UNCLASSIFIED 30%` — the largest slice — also signals a
mapping gap worth surfacing distinctly. **Fix:** thicken the bars, raise fill
contrast, order by magnitude, and visually separate "unclassified" from real
groups.

### 12 · Heatmap reads empty + hover hint on mobile — **MEDIUM**

The Profile Training Heatmap is almost all blank/faint (reads as *broken*, not
*sparse*) and its caption says **"Hover or focus a day…"** — on a touch device
with no hover. **Fix:** raise empty-cell contrast / add a clear "low activity"
floor, and make the hint touch-first ("Tap a day").

---

## Accessibility

### 4 + 5 · Low-contrast labels, weakest at the smallest sizes — **HIGH**

The mono micro-labels that carry the app's structure (overlines,
`DISPLAY NAME`/`GENDER` rows, `LAST TRAINED`, stat captions, the `TRAINED ·`
marker) render in a pale muted grey. Aurora's muted token (`#6f7d9c` on white)
is ≈ **3.9:1**, under WCAG AA 4.5 for normal text — and the same token is applied
to the *smallest* type: `text-[9px]` (88 uses) down to `text-[7px]`
(`gauge.tsx`). The least legible size wears the least legible color, and it's the
text doing the most navigational work. **Fix:** promote labels to the secondary
token, floor label size at ~11px, and re-check the muted token against AA in
both modes.

### 10 · Reduced-motion applied to the wrong animations — **MEDIUM**

`motion-reduce:transition-none` is used 7× — all on trivial *hover* fades — while
the **continuous** animations that actually matter for vestibular sensitivity
have no guard: `GenerationProgress.tsx:31` (`animate-[pulse-sweep…infinite]`),
`GenerationProgress.tsx:18` / `SyncStatusBanner.tsx:107` (`animate-spin`),
`skeleton.tsx:18` (`animate-pulse`). `globals.css` has no
`@media (prefers-reduced-motion: reduce)` block. **Fix:** add a global
reduced-motion rule that neutralizes infinite animations.

### 15 · Sub-44px tap targets — **MEDIUM**

`components/ui/button.tsx`: `size: sm` is `h-9` (36px) and `size: icon` is
`h-10 w-10` (40px); some icon controls (`SessionsLibrary.tsx:330`) use `p-0.5`.
All fall under the 44px touch minimum on a mobile-first PWA. **Fix:** raise
`sm`/`icon` and icon-only controls to a 44px hit area.

### 20 · Decorative icons without `aria-hidden` — **LOW**

~83 `aria-hidden` against ~111 lucide usages — good coverage, not universal.
**Fix:** sweep to add `aria-hidden` to icons beside a text label and
`aria-label` to the few that stand alone.

---

## Hierarchy, cognitive load & brand fit

### 6 · "CAUTION" in violet — **MEDIUM**

The Dashboard readiness badge reads **CAUTION** in the violet accent. Violet
carries no "warning" meaning — that's universally amber. A user won't read purple
as "ease off." Since readiness is the 3-state *safety* signal, color should
encode it (green ready / amber caution / red rest). **Fix:** map caution to a
warm warning hue rather than reusing a brand accent.

### 11 · Monospace body paragraph — **MEDIUM**

The Train intro ("Generate a full multi-week protocol…no AI.") is a three-line
sentence in **mono** — slower to read and reads like terminal output, not
guidance. Contrast it with the Exercise-detail description and "How to perform"
steps, which use body font beautifully. **Fix:** sentence-case body font for
prose; reserve mono for labels/overlines. (This is the visible face of the
broader "uppercase-mono on everything flattens hierarchy" tension — reserve the
mono grammar as an accent, not the baseline.)

### 13 · A wall of equal "START" buttons — **MEDIUM**

Train stacks a filled-teal `GENERATE A PROTOCOL` primary and then five
filled-teal `START` buttons — six full-strength primaries on one screen. When
everything is primary, nothing is. **Fix:** demote the per-card `START` to
secondary/outline so the one true page action leads.

### 17 · "0 TOTAL SETS" hero — **LOW**

Exercise detail shows a big **"0 TOTAL SETS"** for a never-performed movement —
at odds with the hide-zeros discipline elsewhere (the Dashboard hides the PR line
rather than showing "0 kg"). **Fix:** show an empty/"not yet trained" state
instead of a hero zero.

### 18 · Inconsistent title casing — **LOW**

Cards mix `strength · 2026-09-05` (lowercase type-as-title) with `Calisthenics`,
`Run 9k`, `CINDY`. **Fix:** normalize — capitalize the type or always lead with a
human name, relegating the date to metadata.

### 19 · "BY PIERRICK" on every card — **LOW**

Every My-Sessions card shows `BY PIERRICK` — pure repetition when the author is
always the viewer. **Fix:** hide the byline for self-authored sessions; show it
only where it carries provenance (shared/adopted).

### 16 · Equipment data hygiene — **LOW**

The Catalog equipment filter lists both `barbell` and `barbells`, mixes casing
(`Floor`, `bodyweight`, `Low Bar`), and includes an oddly specific product name
(`Atletica R8 Bradley Combat Medium`) beside generic entries. **Fix:**
de-duplicate and normalize the equipment vocabulary; decide whether product-level
entries belong in the same list.

---

## ✅ Strengths worth protecting

- **A committed, consistent identity** across all 8 screens — nothing reads as
  templated default.
- **Honest data surfaced as UI**, repeatedly: `FIRST PR` tags, locked
  achievements with `26/100` progress, "Some recent sets list muscles we don't
  map yet", `NOT TRAINED` stated plainly, PR hidden rather than shown as zero.
  This is exactly the anti-slop discipline the critique exists to enforce —
  already internalized.
- **Cross-screen consistency**: LVL 4 / 5,710 XP / 6-week streak agree between
  Dashboard and Profile — the read-time projection working as designed.
- **The Exercise-detail screen is the typographic high-water mark**: calm body
  copy, clear `SPECS / HISTORY / RECORDS` tabs, well-numbered "How to perform"
  steps. It proves the system *can* do restful reading layouts — the fix for #11
  is to bring the rest of the app closer to this screen, not further from it.
- **Near-perfect token discipline** (verified in code): no hardcoded color in
  components; charts theme via `useChartTheme`; a real `skin × mode`
  architecture.

---

## Recommended fix order

1. **#1 (last last week)** — a one-line, visible copy bug; highest
   effort-to-credibility ratio.
2. **#2 + #3 (Analytics % deltas + chart axis)** — the two things that most
   undercut trust on the most data-dense screen.
3. **#4 + #5 (label contrast + type floor)** — one token/scale change that lifts
   every screen and clears the biggest a11y gap.
4. **#6 (caution color)** and **#7 (hide LISTABLE/STUB)** — quick semantics/copy
   wins.
5. Then the MEDIUM tonal/hierarchy items (#11, #13, #14, #12) as a `polish` pass.

---

*Generated as an `impeccable critique`-style review (source-grounded emulation).
Anchored to `apps/web` at the time of capture.*
