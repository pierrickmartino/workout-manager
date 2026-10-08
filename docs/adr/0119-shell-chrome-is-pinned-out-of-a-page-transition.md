# 0119 — Shell chrome is pinned out of a page transition

**Status:** accepted

A view transition snapshots everything without a `view-transition-name` as one `root`
image and animates that image. The shell's always-mounted chrome would therefore slide
and fade with the page it frames. That chrome is the header, the mobile tab bar, the
desktop sidebar and the sync toast (view-transitions audit §8). The chrome is how a
reader stays oriented, so it is the one thing on screen that must not move when the page
does.

## Decision

**Each persistent element gets a hand-written name, and its group is frozen.**

- The names live in one registry, `PERSISTENT_ELEMENTS` in
  `apps/web/lib/persistent-transition.ts`. A component pins itself with
  `style={persistentTransitionStyle("header")}` and never writes a name by hand. The
  module imports nothing but a type, because it ships in the shell's bundle.
- `app/globals.css` gives each name's `::view-transition-group` `animation: none` and a
  z-index tier: **chrome at 100**, and **overlay at 200** for the sync toast, which floats
  over the tab bar and must not slide behind it.
- **A blurred element drops its old snapshot.** The header, tab bar and toast use
  `backdrop-blur`. A snapshot bakes the blur in, and the baked blur stops matching what
  moves behind it. Those three set `display: none` on `::view-transition-old(name)` and
  `animation: none` on `::view-transition-new(name)`, so only the live element shows.
- **The isolation rules are unlayered.** For normal declarations an unlayered rule beats
  any layered one. A later broad `::view-transition-*(*)` recipe in a layer therefore
  cannot un-pin the chrome. This is the mirror of ADR-0118, whose `!important` off switch
  sits in the *earliest* layer for the same reason.

This step animates nothing. No `<ViewTransition>` exists yet, so no transition runs. It is
defensive: when step 4's page slides land, the chrome is already out of the snapshot.

## Enforcement

`apps/web/lib/persistent-transition-policy.ts`, swept by its test under `npm test`:

- `isolationGaps` parses `app/globals.css` and names every declaration the registry
  requires but the stylesheet lacks: the group's `animation` and `z-index` at the right
  tier, and the old/new pair for a blurred element. A rule inside a media or supports
  query doesn't count, because pinned some of the time is not pinned.
- `findPersistentTransitionUses` reads every `.tsx` file's AST. Each registry key must be
  pinned by exactly one component. A `viewTransitionName` property or a
  `[view-transition-name:…]` class written by hand fails, for two reasons: it has no
  isolation rule, and if the same name renders twice the browser skips the whole
  transition.
- The registry's `hasBackdrop` flag must match whether the pinning component's source
  contains `backdrop-blur`. A blur added later then forces the old snapshot to be dropped.

## Consequences

The registry is where any later hand-named element goes, such as a popover that must stay
still while the page behind it settles. Each one gets an isolation rule or the guard fails.
Shared-element morphs (step 3) are not hand-named: they use `<ViewTransition name=…>`,
which assigns the name itself.

The sync toast still mounts and unmounts with sync state. Pinning keeps it still during a
navigation, but its own appearance is still a pop. That is step 7.

The isolation was checked once in Chromium against Tailwind's compiled stylesheet. With a
slide on the root, the page animated, the four pinned groups ran no animation at all,
their z-index came out at 100/100/100/200, and the blurred three showed no old snapshot.
It was not checked in the running app (that needs Clerk keys), and no CI journey drives a
navigation (audit §11).

## Rejected alternatives

**`<ViewTransition default="none">` around each element instead of a hand name.** It
freezes the element too, but React's auto-generated name can't be targeted from CSS, so
the z-index tiers and the backdrop `display: none` couldn't be expressed.

**`view-transition-name` in the stylesheet, keyed by class.** That would keep name and
rule in one file, but the guard could no longer tell which component carries the name.
Uniqueness, and the blur flag following the component, both need that link.
