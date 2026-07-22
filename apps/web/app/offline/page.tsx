import Link from "next/link";
import { WifiOff } from "lucide-react";

import { Overline } from "@/components/pulse/overline";
import { buttonVariants } from "@/components/ui/button";

// Static, unauthed offline fallback (ADR-0028). The minimal service worker
// precaches exactly this page and serves it when a navigation fails offline —
// "offline is meaningful UI, never an error page". It fetches no data and needs
// no JWT, so it renders from cache with no network. The "Try again" link is a
// plain navigation: it re-hits the network through the service worker, which
// serves the real page if connectivity is back, or this page again if not.
export default function OfflinePage(): React.JSX.Element {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-surface">
        <WifiOff className="h-7 w-7 text-text-muted" aria-hidden />
      </div>
      <div className="flex flex-col items-center gap-2">
        <Overline>PULSE // OFFLINE</Overline>
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary">
          You&rsquo;re offline
        </h1>
        <p className="max-w-xs text-sm text-text-secondary">
          This page needs a connection to load your latest protocols and
          sessions. Your logged work is safe — reconnect to pick up where you
          left off.
        </p>
      </div>
      <Link href="/dashboard" className={buttonVariants({ variant: "primary" })}>
        Try again
      </Link>
    </div>
  );
}
