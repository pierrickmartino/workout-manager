// The desktop sidebar's entries, derived from the same `tab-nav` route-ownership registry
// the bottom TabBar renders from (ADR-0088). Kept here, out of the "use client" component,
// so `sidebar-nav.test.ts` can assert it without a browser — the same split as `tab-nav.ts`
// and `shell-a11y.ts` (CLAUDE.md: frontend logic lives in `lib/` as a tested view-model,
// components stay thin).
//
// There is exactly one piece of logic in the sidebar, and it is the reason this file exists:
// `/admin` is owned by the PROFILE tab (tab-nav.ts), so on an admin route *two* entries would
// otherwise light at once. Two "you are here" markers is worse than none.

import { TABS, isActive, type TabLabel, type TabRoute } from "./tab-nav.ts";

// The admin entry, shown only to admins and only in the sidebar. ADR-0071 kept admin off the
// bottom tab bar because a persistent tab for a role most users never have wastes one of four
// slots; a sidebar has no slot pressure, so ADR-0088 amends that placement at `lg:` and above.
// Below `lg:` admin is still reached by the conditional nav row on Profile.
const ADMIN_ROUTE: TabRoute = {
  label: "PROFILE",
  href: "/admin",
  match: ["/admin"],
};

export const ADMIN_ENTRY_LABEL = "ADMIN";

export type SidebarEntryLabel = TabLabel | typeof ADMIN_ENTRY_LABEL;

export interface SidebarEntry {
  readonly label: SidebarEntryLabel;
  readonly href: string;
  readonly active: boolean;
}

// The sidebar's entries for a pathname: every tab in registry order, then the admin entry
// when — and only when — the caller says the session holds the admin claim. `isAdmin` is
// resolved server-side (`resolveIsAdmin`, ADR-0046) and passed down, so admin status is never
// inferred in the browser; this is an affordance gate, and the backend gates the actions.
export function sidebarEntries(
  pathname: string,
  isAdmin: boolean,
): readonly SidebarEntry[] {
  // The admin entry wins for its own subtree, so PROFILE does not light alongside it.
  const onAdminRoute = isAdmin && isActive(pathname, ADMIN_ROUTE);

  const tabs = TABS.map((tab) => ({
    label: tab.label,
    href: tab.href,
    active: isActive(pathname, tab) && !onAdminRoute,
  }));

  return isAdmin
    ? [
        ...tabs,
        { label: ADMIN_ENTRY_LABEL, href: ADMIN_ROUTE.href, active: onAdminRoute },
      ]
    : tabs;
}
