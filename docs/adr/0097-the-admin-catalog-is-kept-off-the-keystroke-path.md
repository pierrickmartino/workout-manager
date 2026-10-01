# 0097 — The admin catalog is kept off the keystroke path

[`lib/admin-exercises.ts`](../../apps/web/lib/admin-exercises.ts) fetches the whole
shared Catalog in one request (`?limit=500`) and
[`AdminExerciseBrowser`](../../apps/web/components/AdminExerciseBrowser.tsx) renders
and filters it entirely client-side. That is the right shape: the Catalog is a bounded
shared set, and an operator sweeping it for stubs wants the facets to answer instantly
rather than one round-trip at a time.

What was not right is that **everything** happened on the keystroke. A controlled
search input drove a filter pass that sorted 500 rows with `localeCompare`, projected
them, and handed React 500 `<Link>` elements to reconcile, lay out and paint — once
per character, before the character appeared.

Three changes, each addressing a different part of that.

## The sort does not depend on the filters

`selectAdminExerciseRows` filtered, then sorted, then projected. The order of the
catalog is a property of the catalog, not of what is typed into the search box, so
sorting belonged outside the pass that runs per keystroke.
[`projectAdminExerciseRows`](../../apps/web/lib/admin-exercises-view.ts) filters and
projects an already-sorted list, and the component memoizes `sortAdminExercises(rows)`
on `rows` alone.

This is only correct because `filterAdminExercises` preserves order and the sort is
stable, which makes filtering a sorted list the same list as sorting a filtered one.
That equivalence is asserted directly in `admin-exercises-view.test.ts` — over names
that exercise the case-insensitive compare and the id tiebreak — rather than left to
reasoning, and `admin-catalog-list.test.ts` holds the hoist itself by counting how
often the sort runs while four characters are typed.

`selectAdminExerciseRows` is gone rather than kept for a hypothetical caller: nothing
calls it now, and the order it embodied is written out in the equivalence test, where
it is the thing being compared against rather than an export nobody uses.

## The field does not wait for the list

The filters go through `useDeferredValue`. The typed character renders in the urgent
pass and the re-filtered catalog in a second, interruptible one, so a fast typist is
never waiting on 500 rows between characters. This is where the audit suggested the
`SEARCH_DEBOUNCE_MS` pattern that `ExerciseLibrary` uses; that pattern exists to
collapse *network requests*, and there is no request here. A debounce would have added
latency to a local computation to avoid doing it twice. Deferring does the opposite —
nothing is delayed, the work is just allowed to be interrupted.

The summary line and the "Clear filters" affordance read off the *deferred* filters,
not the live ones, so the field, the rows and the count always describe the same
settled pass. A deferred list whose header described the pending one would be a new
bug traded for an old one, and `admin-catalog-list.test.ts` pins all three together.

The deferral itself is not mechanized, and deliberately: `act()` flushes the urgent
and deferred passes together, so a test can only see the settled result. What is
mechanized is that settling leaves the screen consistent.

## A row off the screen costs nothing

Each row carries `.list-row-defer` (`app/globals.css`): `content-visibility: auto`
with `contain-intrinsic-size: auto 74px`. The browser skips style, layout and paint
for rows that are not near the viewport, so an unvirtualized 500-row list costs about
what the dozen rows on screen cost. The `auto` keyword means a row that has been
measured once claims its real height afterwards, so the scrollbar settles instead of
jumping as rows scroll in.

The 74px is an estimate read off the row's own classes — `px-4 py-3.5` around a 15px
name, a 6px gap and a badge line — not something this change measured, and it does not
need to be: `auto` replaces it with the browser's own number the first time a row
renders, so a wrong estimate costs one layout and nothing after it.

This is not virtualization and not `display: none`. Every row stays in the DOM, in the
accessibility tree, and findable by the browser's own find-in-page — which is why it
is the right trade here rather than a windowing dependency: the admin catalog is a
flat list of links, and the only thing it was paying for was pixels it never showed.

A row that lost the class would still look exactly right, so
`admin-catalog-list.test.ts` asserts it on the mounted rows.

## What this does not claim

None of the three is a measured number. They remove work that provably did not need
doing — a sort whose input never changed, a render that blocked a keystroke, a paint
of rows nobody could see — and the tests hold each of those properties. Whether the
screen *feels* different at 500 rows is a question for a profile on a real device, and
no number here should be read as one.
