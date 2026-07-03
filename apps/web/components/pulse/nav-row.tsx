import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface NavRowProps {
  icon: LucideIcon;
  label: React.ReactNode;
  href: string;
  // Optional right-aligned mono value (e.g. "KG", "LINKED", a count).
  value?: React.ReactNode;
  // Accent for the icon tile; defaults to the neutral elevated look.
  accent?: "cyan" | "violet" | "magenta" | "blue" | "neutral";
  valueClassName?: string;
}

const ICON_TILE: Record<NonNullable<NavRowProps["accent"]>, string> = {
  cyan: "bg-cyan-dim text-cyan",
  violet: "bg-violet/15 text-violet",
  magenta: "bg-magenta-dim text-magenta",
  blue: "bg-blue/15 text-blue",
  neutral: "bg-elevated text-text-secondary",
};

// A single settings/navigation row from pulse.pen: an icon tile, a body label
// that fills the width, an optional mono value, and a chevron. Rows are stacked
// inside a Card and separated by <Separator />.
export function NavRow({
  icon: Icon,
  label,
  href,
  value,
  accent = "neutral",
  valueClassName,
}: NavRowProps): React.JSX.Element {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-elevated/50"
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-sm",
          ICON_TILE[accent],
        )}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="flex-1 font-sans text-[15px] font-medium text-text-primary">
        {label}
      </span>
      {value ? (
        <span
          className={cn(
            "label-mono text-[11px] text-text-muted",
            valueClassName,
          )}
        >
          {value}
        </span>
      ) : null}
      <ChevronRight className="h-[18px] w-[18px] text-text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
