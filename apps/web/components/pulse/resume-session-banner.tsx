"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { Play } from "lucide-react";

import { readLiveSessionSlot } from "@/lib/live-session-storage";
import { ownsLiveSlot } from "@/lib/live-session";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

// The unfinished session offered on Home, once its owner is known.
interface ResumableSlot {
  sessionId: number;
  // When the performance was started (epoch ms), for the "Started …" line. Null on an
  // untimed performance, in which case no start time is shown.
  startedAt: number | null;
}

// Format a slot's start instant as a friendly local date/time, or null when the
// performance was never timed. Locale/zone come from the reader's browser.
function formatStartedAt(startedAt: number | null): string | null {
  if (startedAt === null) return null;
  return new Date(startedAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// A "Resume session" affordance surfaced on Home whenever an unfinished Live
// Session exists in the single `localStorage` slot (issue #91 — F2·S6, ADR-0012),
// owned by the signed-in account (issue #411 — ADR-0059). Client-only: the slot lives
// in `localStorage`, so this reads it after auth resolves and renders nothing during
// SSR and the first paint, then appears if there is a performance to pick back up.
// A slot owned by another account (or a legacy id-less one) is never offered, so a
// shared browser never surfaces one account's workout to another. There is no
// client-side hard expiry — an abandoned same-account slot is always offered, with its
// start date/time — distinct from ADR-0014's server-side idle auto-end.
export function ResumeSessionBanner(): React.JSX.Element | null {
  const { userId, isLoaded } = useAuth();
  const [slot, setSlot] = useState<ResumableSlot | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    const stored = readLiveSessionSlot();
    if (stored && stored.status !== "finished" && ownsLiveSlot(stored, userId ?? null)) {
      setSlot({ sessionId: stored.sessionId, startedAt: stored.startedAt });
    } else {
      setSlot(null);
    }
  }, [isLoaded, userId]);

  if (slot === null) return null;

  const startedLabel = formatStartedAt(slot.startedAt);

  return (
    <Card className="flex flex-col gap-3 border-cyan p-4">
      <span className="label-mono text-[11px] text-cyan">
        LIVE // SESSION IN PROGRESS
      </span>
      <p className="font-mono text-[13px] leading-relaxed text-text-secondary">
        You have an unfinished session. Pick up exactly where you left off.
      </p>
      {startedLabel ? (
        <p className="font-mono text-[12px] text-text-muted">
          Started {startedLabel}
        </p>
      ) : null}
      <Link
        href={`/sessions/${slot.sessionId}/live`}
        className={buttonVariants({ className: "w-full" })}
      >
        <Play className="h-4 w-4" />
        Resume session
      </Link>
    </Card>
  );
}
