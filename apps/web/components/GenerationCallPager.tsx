import Link from "next/link";

import type { AuditLogPager } from "@/lib/admin-generation-calls-query";
import { NAV_BACK, NAV_FORWARD, type NavDirectionProps } from "@/lib/nav-direction";
import { cn } from "@/lib/utils";

interface GenerationCallPagerProps {
  pager: AuditLogPager;
}

// The admin AI audit log's pager (issue #732): which calls this page shows, and links to newer
// and older pages that keep the filters. Server-rendered links, so paging needs no client
// JavaScript. A same-path pager over a newest-first sequence (ADR-0122): `Older →` arrives
// from the right, `← Newer` from the left, through the page-keyed boundary the page wraps the
// list in. An end of the log renders its link muted and inert. The row wraps, so it holds at
// 320px and 200% text.
export function GenerationCallPager({ pager }: GenerationCallPagerProps): React.JSX.Element {
  return (
    <nav
      aria-label="AI audit log pages"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    >
      <PagerLink href={pager.newerHref} direction={NAV_BACK}>
        ← Newer
      </PagerLink>
      <span className="label-mono text-[11px] text-text-muted">{pager.rangeLabel}</span>
      <PagerLink href={pager.olderHref} direction={NAV_FORWARD}>
        Older →
      </PagerLink>
    </nav>
  );
}

function PagerLink({
  href,
  direction,
  children,
}: {
  href: string | null;
  // Which way the next page of calls arrives (ADR-0122).
  direction: NavDirectionProps;
  children: React.ReactNode;
}): React.JSX.Element {
  const className = cn(
    "label-mono text-[11px]",
    href === null ? "text-text-muted" : "text-cyan hover:underline",
  );

  return href === null ? (
    <span aria-disabled="true" className={className}>
      {children}
    </span>
  ) : (
    <Link href={href} {...direction} className={className}>
      {children}
    </Link>
  );
}
