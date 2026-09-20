// Canonical route-ownership for the bottom TabBar. This is the single source of
// truth for "which section owns which route family" — the component (tab-bar.tsx)
// renders from `TABS` and only attaches presentation (icons). Keeping the route data
// here, out of the "use client" component, lets `tab-nav.test.ts` assert coverage
// without a browser (CLAUDE.md: frontend logic lives in `lib/` as a tested view-model,
// components stay thin).
//
// Ownership is by **top-level path segment**: a tab lights when the pathname equals one
// of its `match` prefixes or sits beneath it. Every navigable top-level segment must be
// owned by exactly one tab OR be listed in `TAB_LESS_ROUTES`; the coverage test fails
// closed when a new route family forgets to declare its orientation (finding #10).

export type TabLabel = "HOME" | "TRAIN" | "STATS" | "PROFILE";

export interface TabRoute {
  label: TabLabel;
  href: string;
  // Route prefixes (top-level families) that should light this tab as active.
  match: string[];
}

export const TABS: TabRoute[] = [
  { label: "HOME", href: "/dashboard", match: ["/dashboard"] },
  {
    label: "TRAIN",
    href: "/train",
    match: ["/train", "/sessions", "/protocols", "/exercises"],
  },
  {
    label: "STATS",
    href: "/analytics",
    // `/logs` (the ad-hoc "Log a movement" flow) is reached only from History, which
    // lives under STATS; the active tab mirrors that navigational parent (finding #10).
    match: ["/analytics", "/history", "/metrics", "/logs"],
  },
  {
    label: "PROFILE",
    href: "/profile",
    // `/admin` is reached by the admin-only nav row on Profile (ADR-0071 keeps admin off
    // the tab bar as a persistent tab, but orientation inside it still follows its parent).
    match: ["/profile", "/admin"],
  },
];

// Signed-in-or-public routes that deliberately render no active tab. `/onboarding` is a
// full-screen first-run flow; the rest are signed-out or chrome-less surfaces where the
// authed TabBar either isn't shown or has no meaningful "you are here". Anything not here
// and not owned by a tab is a route that silently lost orientation — a bug the coverage
// test catches.
export const TAB_LESS_ROUTES: string[] = [
  "/onboarding",
  "/offline",
  "/shared",
  "/sign-in",
  "/sign-up",
];

// A tab is active when the pathname exactly equals one of its match prefixes or is a
// descendant of it (slash-boundary, so `/logs` never matches `/logspace`).
export function isActive(pathname: string, tab: TabRoute): boolean {
  return tab.match.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// The tab that owns a pathname, or `null` when the route is deliberately tab-less. Throws
// if a pathname is owned by more than one tab — that's a match-prefix collision, a bug.
export function activeTab(pathname: string): TabRoute | null {
  const owners = TABS.filter((tab) => isActive(pathname, tab));
  if (owners.length > 1) {
    const labels = owners.map((tab) => tab.label).join(", ");
    throw new Error(`Route "${pathname}" is claimed by multiple tabs: ${labels}`);
  }
  return owners[0] ?? null;
}
