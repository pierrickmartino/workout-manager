# 0092 — The icon set is reached through the design system

`components/pulse/` is a real design system: 36 components the app composes
instead of styling raw elements. Icons were the hole in it. **66 files** imported
`lucide-react` directly, which made an icon the one piece of design-system surface
a component could take without going through `pulse/`.

That costs nothing until someone wants to act on the set as a set — a default
size, a default stroke width, a default `aria-hidden`, a swap to another library,
a wrapper that enforces one of the existing guards on every icon at once. Then it
is 66 files instead of one.

So: **exactly one module names `lucide-react`, and it is
[`components/pulse/icons.ts`](../../apps/web/components/pulse/icons.ts).**
Everything else imports from `@/components/pulse/icons`.

This is the one item in this record that is not a defect. Nothing was broken, no
user-visible behaviour changed, and `lucide-react` is a stable dependency with no
swap proposed. It is refactoring insurance, written down because the insurance is
only worth anything if it does not erode — which is what the guard is for.

## It re-exports icons, not `pulse/`

The flat-barrel-over-everything version of this idea is a different and worse
change. A `components/pulse/index.ts` re-exporting 36 components would put every
component in every importer's module graph and make the design system one
circular-import away from unbuildable, for the sake of shorter import lines.

`icons.ts` re-exports **one package, by name**: a flat list of the 63 icons the
app renders plus the `LucideIcon` type, which a reviewer can read and a bundler
can tree-shake. Adding an icon is a line here and an import at the call site.

## The weight was measured, not assumed

A barrel that every component imports is exactly the shape that regresses a
bundle, and ADR-0090 is this repo's record of what that costs. So it was measured
rather than reasoned about: a production build before the change and after,
summing the gzipped weight of each route's client chunks from
`.next/server/app/<route>/page_client-reference-manifest.js` — the procedure
ADR-0088 prescribes.

Every route's client chunk weight is **byte-for-byte identical**, across all 35
routes, and so is the total of every built client chunk (674 KB gzipped).

Two things make that hold, and both are worth knowing because either could stop
being true:

- Next.js rewrites a named `lucide-react` import into the per-icon module
  (`optimizePackageImports`, on by default for this package), so the package's own
  barrel is never walked.
- These are **pure re-exports** with no module-level code, so standard
  tree-shaking drops the names a call site does not use.

A wrapper component in this module — `<Icon name="plus" />`, say, or a
`forwardRef` that applies a default size — would break the second one, because the
name would no longer be statically resolvable to one icon. If that is ever wanted,
measure it again; it is not free the way this is.

## The guard

[`icon-import-policy.ts`](../../apps/web/lib/icon-import-policy.ts) fails on any
import or re-export declaration naming the icon package from any module but
`icons.ts`.

It sweeps the **whole web root** — every `.ts`, `.tsx`, `.mts`, `.mjs`, `.js` and
`.jsx` outside `node_modules`, `.next` and `public` — which is wider than the chart
guards' `components/` + `app/`, on purpose and with nothing carved out. An icon
import costs nothing to write anywhere, so `scripts/`, `prototypes/`, the root
`proxy.ts` and the `audit/` harness are all in. (`audit/` is exempt from the
*chart* guards because it must import a chart statically to mount it for the parity
assertion. No such need exists for an icon, which it can take from the design
system like anything else.) A first draft of this guard swept three directories and
still claimed to fail closed; it did not, and `scripts/` was the proof.

It **fails closed** on the package rather than on a known set of exports, so a new
icon, a renamed export, or a deep import
(`lucide-react/dist/esm/icons/plus`) is caught without the guard knowing the icon
set. It reads the AST — through the same
[`module-specifiers.ts`](../../apps/web/lib/module-specifiers.ts) walk
`recharts-import-policy` uses — so a package name in a comment, a string, or a
dynamic import never counts.

Two deliberate differences from `recharts-import-policy`, which is why that walk
reports both facts and decides neither:

- **A type-only import is not exempt.** `LucideIcon` costs no bytes, but naming it
  from the package is the same coupling this rule removes — which is why `icons.ts`
  re-exports the type.
- **A re-export counts.** A second barrel somewhere else is the loophole an
  import-only check would leave open.

The exemption registry is empty. An entry asserts that one more file must be
edited every time the icon set is wrapped or replaced, so the reason is a required
field.

**What it proves, and what it does not.** It proves no module outside the design
system names the icon package. It does not prove the barrel is weightless — that
is a build property, and the measurement above is what says so. A green sweep is
not a measurement, and this record does not let it imply one.

## Consequences

- One more hop between a component and the icon it renders, and a line to add to
  `icons.ts` the first time an icon is used. That is the whole cost.
- A 66-file diff with no behaviour change in it, which is a diff nobody enjoys
  reviewing. It is a one-off; the guard is what stops it recurring at 67.
- The re-exports are value exports, so the icon module is a runtime dependency of
  every component that draws an icon. Keeping it to pure re-exports with no
  module-level code is load-bearing for the measurement above, not a style choice.
