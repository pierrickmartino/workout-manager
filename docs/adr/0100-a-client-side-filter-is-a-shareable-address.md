# 0100 — A client-side filter is a shareable address

Four screens filter an already-fetched list in the browser: History, My Sessions,
the Exercise catalog taxonomy, and — since the audit's #7 — the admin catalog.
Three of them already mirrored their filter state into the URL. The admin one did
not, so "all AI-provenance movements with incomplete metadata" could be neither
sent to a colleague nor bookmarked, and a refresh dropped it.

This ADR exists because that convention had been stated three times in code and
nowhere as a rule. It records what the three screens already do, and makes it the
answer for the next one.

## The rule

A filter the user can see is part of the view's address:

1. The round-trip lives in the `lib/` view-model as `parse*Filters` and
   `*FiltersToQuery`, so it is unit-testable without a browser and the component
   stays thin.
2. The component seeds its state from `useSearchParams` **once**, in a `useState`
   initializer, and owns it from there.
3. Changes are mirrored back through `replaceFilterQuery` in
   [`lib/filter-url.ts`](../../apps/web/lib/filter-url.ts), which is a
   `window.history.replaceState` and never a router navigation. Each screen owns its
   own `*FiltersToQuery` because each has its own axes; what happens to the query
   string afterwards is the same everywhere, and had been copied four times.
4. The page wraps the component in `Suspense`, per the App Router's contract for
   `useSearchParams`.

## Why `replaceState` and not a navigation

A router push re-runs the Server Component, which re-runs its one-shot fetch. On
the admin catalog that is 500 rows per keystroke — exactly the cost ADR-0097 had
just finished removing from the same screen. The filtering is client-side over data
already in the browser; the URL write is bookkeeping, and bookkeeping should not
re-fetch.

It also keeps the Back button meaning what the user expects. Pushing a history
entry per keystroke would make Back walk backwards through a search box one
character at a time.

## Parsing is where an untrusted value dies

The query string is input from outside. A facet value outside the closed vocabulary
is dropped at parse rather than filtered on: a `?provenance=marketing` that survived
would show an empty catalog under a dropdown reading "All provenance", with nothing
on screen to explain the emptiness, because the control has no option to display.

This is deliberately stricter than `provenanceLabel`, which renders an unknown token
that a *row* carries so a future catalog value still appears. A value a row has and a
value a filter offers are different questions, and conflating them is what makes a
lenient parse look reasonable.

The membership test is `Object.hasOwn`, not `in`. The vocabularies are object
literals, so `in` also answers yes for every key on `Object.prototype` — the first
draft of this check accepted `?provenance=constructor`, which is precisely the URL
it exists to reject, and its test passed because the test tried `marketing`. Closed
means closed, including the keys nobody wrote.

## The live value, not the deferred one

ADR-0097 defers the admin catalog's filter pass and reads the summary copy and the
Clear-filters affordance off the *deferred* filters, so the header never describes a
list that is not on screen yet.

The URL is the exception, and it is written from the live filters. It is not a
rendered surface: nothing on screen can disagree with it, and what the user would
share is what they have typed. Restoring from it lands on the same settled state
either way.

## No guard

There is no sweep for this. "A filter is in the URL" is a property of a screen's
behaviour, not of a token or an attribute, and the failure mode is a missing feature
rather than a wrong one — nothing to key on in the source.

What is mechanized is per-screen, by the tests that already exist:
`admin-exercises-view.test.ts` holds the round-trip and the dropping of unknown
facets, and `admin-catalog-list.test.ts` mounts the browser to hold the two halves a
view-model cannot — that it opens filtered when the URL says so, and that typing
reaches the address bar. "Without a navigation" is held structurally rather than
asserted: that mount's `next/navigation` boundary hands out a `useRouter` that
throws, so a screen that reached for the router to write its URL would not mount.

## Consequences

- A new client-side filter is four small pieces, not a design decision.
- A filter's vocabulary is now load-bearing twice: once for the control's options and
  once for what the parser will accept. They must not drift.
- The screens that fetch per filter change (the catalog taxonomy) still write the URL
  the same way; the mirror is independent of whether a fetch follows it.
