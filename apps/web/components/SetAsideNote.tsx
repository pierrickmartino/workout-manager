"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Alert } from "@/components/pulse/alert";

interface SetAsideNoteProps {
  // The set-aside Protocol's resolved display label (ADR-0021).
  label: string;
}

// The short, non-blocking note a freshly adopted Protocol shows when generating it set the
// previous Current Protocol aside (ADR-0125). It replaced the generate-time confirmation:
// superseding can be undone by a Switch, so the user is told where the old Protocol went
// rather than asked whether to let it go.
//
// A polite `status` region that never takes focus. It is served empty and filled after
// mount, because a region that arrives already holding its text is usually not announced
// (the shape `SyncStatusBanner` keeps, ADR-0124). The label is an authored name and can be
// 120 unbroken characters: `wrap-anywhere`, not `break-words`, because only it lets the
// Alert's flex item shrink below that word's width (ADR-0085).
export function SetAsideNote({ label }: SetAsideNoteProps): React.JSX.Element {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div role="status" aria-live="polite">
      {mounted ? (
        <Alert tone="info">
          <span className="wrap-anywhere">
            “{label}” is set aside. You can switch back to it from{" "}
            <Link href="/protocols" className="text-cyan underline-offset-2 hover:underline">
              Protocols
            </Link>
            .
          </span>
        </Alert>
      ) : null}
    </div>
  );
}
