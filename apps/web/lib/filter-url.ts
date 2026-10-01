// The one way a client-side filter writes itself into the URL (ADR-0100).
//
// Four screens filter an already-fetched list in the browser — History, My Sessions, the
// Exercise catalog taxonomy and the admin catalog — and all four mirror their filters into
// the address bar so the narrowed view can be shared, bookmarked and survive a refresh. Each
// owns its own `*FiltersToQuery`, because each has its own axes; what they share is what
// happens to the query string afterwards, and that was copied four times.
//
// No React import: this is a plain DOM write, called from the effect or handler that already
// knows the filters changed.

// Mirror a filter query string onto the current URL, without a navigation.
//
// `replaceState`, not a router push, for two reasons. A push re-runs the Server Component and
// its one-shot fetch, which on the admin catalog is 500 rows per keystroke — the cost
// ADR-0097 exists to remove. And a history entry per keystroke would make Back walk a search
// box backwards one character at a time.
//
// An empty query leaves the bare path rather than a trailing `?`, so a cleared filter shares
// as the unfiltered view.
export function replaceFilterQuery(params: URLSearchParams): void {
  const search = params.toString();
  window.history.replaceState(
    null,
    "",
    search.length > 0 ? `?${search}` : window.location.pathname,
  );
}
