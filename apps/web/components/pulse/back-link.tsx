import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";

interface BackLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

// Consistent "← back to …" navigation link in the muted mono style.
export function BackLink({
  href,
  children,
  className,
}: BackLinkProps): React.JSX.Element {
  return (
    <Link
      href={href}
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
