"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Zap, BarChart3, User, Shield, type LucideIcon } from "@/components/pulse/icons";

import { cn } from "@/lib/utils";
import {
  sidebarEntries,
  ADMIN_ENTRY_LABEL,
  type SidebarEntryLabel,
} from "@/lib/sidebar-nav";
import { NAV_LABELS } from "@/lib/shell-a11y";

// The desktop half of the app's primary navigation (ADR-0088). Which entries exist and which
// one lights lives in `@/lib/sidebar-nav`, over the same route-ownership registry the TabBar
// renders from; this component owns only presentation — the same split as `tab-bar.tsx`.
//
// Exactly one of the two navigations is ever in the accessibility tree: this is
// `hidden lg:flex` and the TabBar is `lg:hidden`, and `display: none` removes the other
// outright. That is why both carry the `NAV_LABELS.primary` landmark label — it is one
// landmark, rendered twice.

const ICONS: Record<SidebarEntryLabel, LucideIcon> = {
  HOME: LayoutGrid,
  TRAIN: Zap,
  STATS: BarChart3,
  PROFILE: User,
  [ADMIN_ENTRY_LABEL]: Shield,
};

interface SidebarProps {
  // Resolved server-side from the Clerk `role` claim (`resolveIsAdmin`, ADR-0046) and passed
  // in, so admin status is never inferred in the browser. An affordance gate only — the
  // backend rejects a non-admin action whatever this renders.
  isAdmin: boolean;
}

export function Sidebar({ isAdmin }: SidebarProps): React.JSX.Element {
  const pathname = usePathname() ?? "";
  const entries = sidebarEntries(pathname, isAdmin);

  return (
    <nav
      aria-label={NAV_LABELS.primary}
      // The wide sweep (`audit/wide.mjs`) asserts this is the navigation actually rendering
      // at 1440px, so it needs a handle that does not depend on reading class strings.
      data-shell-nav="sidebar"
      className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-1 border-r border-border bg-surface px-3 py-6 lg:flex"
    >
      {/* No wordmark here: the header carries the one brand mark at every width, because this
          sidebar is not rendered for a signed-out visitor and a desktop sign-in screen would
          otherwise be unbranded (#575 review). This is navigation only. */}
      {entries.map((entry) => {
        const Icon = ICONS[entry.label];
        return (
          <Link
            key={entry.label}
            href={entry.href}
            aria-current={entry.active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md border px-3 py-2 transition-colors",
              entry.active
                ? "border-cyan/40 bg-cyan-dim text-cyan"
                : "border-transparent text-text-muted hover:border-border hover:text-text-primary",
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className="label-mono text-[11px] font-semibold">{entry.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
