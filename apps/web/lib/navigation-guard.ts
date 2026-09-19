// Pure decision logic for the dirty-form navigation guard (finding #4). The guard
// intercepts in-app navigations away from a form with unsaved changes and asks the
// user to confirm before discarding them. This module holds the one non-trivial,
// browser-free decision — "is this click a client-side navigation we should guard?"
// — so it is unit-testable without a DOM. The provider (components/) builds a
// `NavigationClickInfo` from a real `MouseEvent` and acts on the result.

// A flattened, DOM-free description of an anchor click. The provider fills this from
// the live event/anchor/location; every field the decision reads lives here so the
// logic never touches `window`.
export interface NavigationClickInfo {
  // Whether some earlier handler already called `preventDefault` — if so the click is
  // not ours to claim.
  defaultPrevented: boolean;
  // The mouse button (0 = primary). Middle/right clicks never navigate in-place.
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  // The nearest ancestor anchor of the click target, or null when the click did not
  // land on (or inside) a link.
  anchor: {
    // The anchor's fully-resolved absolute URL (an `<a>`'s `.href` is always absolute).
    href: string;
    // The `target` attribute, or null when unset. Anything but null/`_self` opens a
    // new browsing context, which we never guard.
    target: string | null;
    // Whether the anchor carries a `download` attribute (a file save, not a nav).
    download: boolean;
    // The anchor's origin, compared against the current origin to reject external links.
    origin: string;
  } | null;
  // The document's current origin and full URL, used to reject cross-origin links and
  // same-page (hash-only) navigations.
  currentOrigin: string;
  currentUrl: string;
}

// Decide whether a click should be intercepted by the guard, and if so, to where.
// Returns the destination as a root-relative `pathname + search + hash` string when
// the click is an in-app, in-place navigation worth guarding; otherwise null (let the
// browser/router handle it untouched). The caller only consults this when a form is
// actually dirty, so this function is purely about "is this a real route change?".
export function resolveGuardedNavigation(
  info: NavigationClickInfo,
): string | null {
  // Someone already handled it, or it is not a plain primary click — leave it alone.
  if (info.defaultPrevented || info.button !== 0) return null;
  if (info.metaKey || info.ctrlKey || info.shiftKey || info.altKey) return null;

  const { anchor } = info;
  if (anchor === null) return null;

  // A new tab/window or a file download is not an in-place navigation.
  if (anchor.target !== null && anchor.target !== "_self") return null;
  if (anchor.download) return null;

  // Only same-origin links are client-side navigations we can guard; an external link
  // leaves the app and is covered by `beforeunload`, not this path.
  if (anchor.origin !== info.currentOrigin) return null;

  const destination = new URL(anchor.href);
  const current = new URL(info.currentUrl);

  // A link that only changes the hash of the current page (or points at the exact
  // current URL) is not a route change — don't prompt for an in-page jump.
  const samePage =
    destination.pathname === current.pathname &&
    destination.search === current.search;
  if (samePage) return null;

  return `${destination.pathname}${destination.search}${destination.hash}`;
}
