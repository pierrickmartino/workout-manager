"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Zap, BarChart3, User, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { TABS, isActive, type TabLabel } from "@/lib/tab-nav";

// Route ownership (which tab lights for which path) lives in `@/lib/tab-nav` so it can be
// tested without a browser; this component owns only presentation. Icons are attached here
// by label — the one bit of the tab that is purely visual.
const ICONS: Record<TabLabel, LucideIcon> = {
  HOME: LayoutGrid,
  TRAIN: Zap,
  STATS: BarChart3,
  PROFILE: User,
};

// Bottom navigation mirroring pulse.pen's tab bar: a top "tick" indicator, an icon, and a
// mono micro-label. Active tab is cyan, the rest are muted.
export function TabBar(): React.JSX.Element {
  const pathname = usePathname() ?? "";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-shell items-stretch justify-between px-3 pb-5 pt-0">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          const Icon = ICONS[tab.label];
          return (
            <Link
              key={tab.label}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-2 pt-0"
            >
              <span
                className={cn(
                  "h-0.5 w-6 rounded-full",
                  active ? "bg-cyan" : "bg-transparent",
                )}
              />
              <Icon
                className={cn(
                  "h-[22px] w-[22px]",
                  active ? "text-cyan" : "text-text-muted",
                )}
              />
              <span
                className={cn(
                  "label-mono text-[9px] font-semibold",
                  active ? "text-cyan" : "text-text-muted",
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
