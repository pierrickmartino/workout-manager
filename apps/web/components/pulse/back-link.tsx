import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "@/components/pulse/icons";

import { cn } from "@/lib/utils";
import { NAV_BACK } from "@/lib/nav-direction";

interface BackLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

// Consistent "← back to …" navigation link in the muted mono style. Every back control in the
// app renders through here, so this one spread makes all of them slide back (ADR-0121).
export function BackLink({
  href,
  children,
  className,
}: BackLinkProps): React.JSX.Element {
  return (
    <Link
      href={href}
      {...NAV_BACK}
      className={cn(
        "label-mono inline-flex items-center gap-1.5 text-[11px] text-text-secondary transition-colors hover:text-cyan",
        className,
      )}
    >
      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
      {children}
    </Link>
  );
}
