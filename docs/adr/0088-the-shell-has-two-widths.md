# 0088 — The shell has two widths

Every screen in this app is a 26rem column. `--spacing-shell: 26rem` is commented
"the pulse.pen frames are 390px mobile shells", and the header, `<main>` and the
`TabBar` all carry `max-w-shell`. On a phone that is the whole viewport. On a
1440px monitor it is a 416px strip of app centred in a thousand pixels of
nothing, with a bottom tab bar — phone chrome — pinned to the bottom edge of the
screen.

That is fine for training, which is the one thing nobody does at a desk. It is
not fine for the three things people *do* do at a desk: reviewing their own
record, authoring Sessions and Protocols, and curating the Exercise catalog. The
admin tables are the sharpest case — a 416px column loses information a table has
no way to give back.

So **the shell has two widths**: `--spacing-shell` (26rem) and
`--spacing-shell-wide` (72rem), and at `lg:` and above the frame is the wide one.

## One component tree, reflowed by CSS

The desktop layout is **not** a second app. There is no `/desktop` route, no
device branch, no server-side User-Agent read. The same components render at
every width and CSS decides the arrangement, for a reason that is not merely
tidiness: there is no such thing as a device here, only a viewport, and a
viewport changes while the page is open. A UA branch would also have to run
before the render that Clerk and the Skin resolution already make request-shaped,
and it would fork every fixture in `audit/` into two.

The threshold is Tailwind's `lg:`, which is **64rem** — and the `rem` is load
bearing in the opposite direction from [ADR-0087](0087-a-field-row-stacks-when-its-fields-no-longer-fit.md).
That ADR is about `rem` *tracks*, which keep their size while the viewport keeps
its pixels; a 7rem column is 224px once the root font doubles. A `rem`
*breakpoint* scales the same way and that is exactly what you want from it: at
200% text, `lg:` fires at 2048 CSS px, so a reader who has doubled their text
keeps the stacked single column on a 1024px laptop, where they need the room per
glyph more than they need a second column. The two-width shell therefore cannot
take anything away from the readers ADR-0085 and ADR-0087 were written for.

## Below `lg:` nothing moves

Stated as a rule because it is what makes this change safe to review: the mobile
layout is **frozen**. Every existing class stays; the desktop layout is expressed
only in `lg:` variants and in markup that is `hidden` below it. The narrow layout
is the one the reflow, contrast, motion, faded-text and chart guards actually
cover, and the one carrying ADR-0071's click budget. Nothing here re-opens either.

## The frame goes wide app-wide; the content column opts in per route

These are separate decisions and conflating them is how this change would have
become a twenty-five-file rewrite.

The **frame** — the sidebar, the wide header, the absence of a bottom tab bar —
is a property of the app, and lands everywhere at once. A sidebar next to some
routes and a tab bar next to others is not a shell.

The **content column** is a property of a page, and each page converts when
someone designs it. Until then it stays 26rem inside the wide frame. Around 25
routes were authored as a 416px column — `SessionsLibrary` rows, the prescription
editors, every authoring form — and letting `<main>` stretch them all on the day
the sidebar lands would be a visible regression on every one, in service of no
decision anybody made about them.

The mechanism is one line, and the default is narrow:

```tsx
<div className="mx-auto w-full lg:max-w-shell lg:has-[[data-shell=wide]]:max-w-shell-wide">
```

A page opts in by stamping `data-shell="wide"` on its own root element. `:has()`
is what lets the *parent's* width answer to the *child's* declaration, so a
converted page needs no prop threaded through the layout and an unconverted page
needs no wrapper added to it — the inversion that takes this from ~25 touched
files to zero. Where `:has()` is unsupported the page simply stays narrow, which
is the safe direction to fail.

## Navigation is the same navigation

[`tab-nav.ts`](../../apps/web/lib/tab-nav.ts) is a route-ownership registry with
a coverage test that fails closed: every navigable top-level segment must be
owned by exactly one tab or listed in `TAB_LESS_ROUTES`. The sidebar renders from
**that registry**, not from a hand-written list of links, or the two would drift
and only one of them would be tested.

`TabBar` and `Sidebar` are therefore the same navigation at two widths, and
exactly one is in the DOM's accessibility tree at a time — `lg:hidden` and
`hidden lg:flex` are `display: none`, which removes the other outright. They
share the `NAV_LABELS.primary` landmark label for the same reason: it is one
landmark, rendered twice.

The sidebar is a **flex sibling**, not a fixed overlay with a padding offset on
everything else. Clerk's `<SignedIn>` renders nothing when signed out, so a
sibling simply isn't there on the sign-in screen and the content fills the width
with no conditional offset anywhere. The content column that sits beside it
carries `min-w-0`, without which a flex child's automatic minimum is its
content — the same escape hatch, for the same reason, as ADR-0085's `<fieldset>`.

## Admin gets a sidebar entry — amending ADR-0071

[ADR-0071](0071-role-aware-intent-first-information-architecture.md) rejected an
admin tab, and its reasoning was: "a persistent tab for a role most users never
have is a mobile-nav smell; a conditional nav row costs nothing for non-admins."
That reasoning is about **four slots in a bottom bar**. A sidebar has no slot
pressure, and admin is one of the three things this shell exists to serve.

So at `lg:` an admin sees an Admin entry in the sidebar; below `lg:` the tab bar
is unchanged and admin stays one hop behind Profile, exactly as ADR-0071
specifies. The rest of ADR-0071 — one unified UI, intent-first defaults, the
click budget — is untouched; only this sub-decision is amended, and only at a
width it never considered.

The entry renders from `resolveIsAdmin()`, the same server-side claim read as
everything else admin-gated (ADR-0046), so admin status is still never inferred
in the browser. As there, this is an affordance gate: the backend independently
rejects a non-admin action regardless of what the sidebar draws.

## What a desktop page may add, when its turn comes

Converting a page is allowed to put **read-time projections** on it that the
narrow layout sheds for space. It is not allowed to add an **action**. ADR-0071's
click budget governs the paths to doing things, and duplicating an action is how
a second entry point to the same intent appears and the budget stops meaning
anything; a projection is just information that finally has somewhere to sit.

The cost is named rather than hidden. A server component cannot see the viewport,
so anything a desktop page adds is rendered and hidden with `hidden lg:block`,
and a phone pays for markup it will never paint. The budget is **~10KB
compressed and no meaningful cold-mobile latency**; past that the block becomes a
`matchMedia`-gated client component fetching through a route handler, which costs
a loading state and buys the payload back. This is the price of refusing UA
detection. It is the right price and it is not zero.

## The guards keep their teeth

[`reflow-policy.ts`](../../apps/web/lib/reflow-policy.ts) flattens variants on
purpose: a `sm:grid-cols-[1fr_4rem]` is a floored track *somewhere*, and the
guard fails closed on it. A desktop-only `lg:grid-cols-[1fr_20rem]` would be
flagged the same way, though it can never apply below 64rem.

The tempting fix is to teach the guard about `lg:`. We are not doing that: the
guard's whole value is that it does not reason about when a class applies, and an
exemption for one breakpoint prefix is an exemption for every mistyped one.
Instead, **the desktop layout is written in `lg:grid-cols-N` and flex only, never
in bracket track syntax**. The guard never sees a rigid track, needs no
carve-out, and stays exactly as strict as it was.

Which leaves the wide viewport unmeasured by anything, since `audit/reflow.mjs`
renders at 320×568 and nothing in the repo has ever looked above 416px. So
[`audit/wide.mjs`](../../apps/web/audit/wide.mjs) joins it: the same
`audit/main.tsx` journeys and the same `audit/fixtures.ts` names, at 1440×900,
asserting that the document does not overflow, that the shell honours its own
72rem cap, and that an unconverted page's content column is still 26rem — a page
that stretches by accident is the failure mode this change actually has.

As ever it proves the frame, not the design. That a wide page reads well is not
something a runner can tell you.

## Consequences

- Two spacing tokens where there was one, and a `data-shell="wide"` contract
  between a page and the layout that is easy to forget. A page that forgets it
  renders narrow — visibly wrong, not subtly broken, which is the failure mode to
  prefer.
- An intermediate state, one PR long: the sidebar lands before Home is widened,
  so a desktop user briefly sees a sidebar beside a 26rem Home.
- No new `lib/` view-model, and so no new unit tests beyond the sidebar's own
  coverage of the registry and the admin gate. A CSS-only change has no logic to
  test, and inventing a module to move a coverage number would be the speculative
  abstraction the conventions warn about.
