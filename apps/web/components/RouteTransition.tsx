"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

// The one directional page transition (ADR-0121). Keyed on the pathname, so a route change
// unmounts the old page's boundary and mounts the new one: the pair fires exit and enter,
// and the navigation's type picks the slide. A navigation with no type — tab to tab, a
// server-action redirect, a revalidation — resolves to `none` and swaps instantly; so does
// a query-only change, which keeps the same key. Pages render no page-level boundary of
// their own: a second one inside this would mount as a unit with it and never fire.
//
// The root layout is the app's only layout, so remounting this subtree on a path change
// discards no layout state; the page under it is a new component on a new path anyway.
export function RouteTransition({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  return (
    <ViewTransition
      key={pathname}
      default="none"
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
    >
      {children}
    </ViewTransition>
  );
}
