"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Zap, BarChart3, User, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface Tab {
  label: string;
  href: string;
  icon: LucideIcon;
  // Route prefixes that should light this tab as active.
  match: string[];
}

// Bottom navigation mirroring pulse.pen's tab bar: a top "tick" indicator, an
// icon, and a mono micro-label. Active tab is cyan, the rest are muted. The four
// tabs map onto the app's existing sections without changing any routes.
const TABS: Tab[] = [
  { label: "HOME", href: "/dashboard", icon: LayoutGrid, match: ["/dashboard"] },
  {
    label: "TRAIN",
    href: "/train",
    icon: Zap,
    match: ["/train", "/sessions", "/protocols", "/exercises"],
  },
  {
    label: "STATS",
    href: "/analytics",
    icon: BarChart3,
    match: ["/analytics", "/history", "/metrics"],
  },
  { label: "PROFILE", href: "/profile", icon: User, match: ["/profile"] },
];

function isActive(pathname: string, tab: Tab): boolean {
  return tab.match.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function TabBar(): React.JSX.Element {
  const pathname = usePathname() ?? "";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-shell items-stretch justify-between px-3 pb-5 pt-0">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          const Icon = tab.icon;
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
