"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Play } from "lucide-react";

import { readLiveSessionSlot } from "@/lib/live-session-storage";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

// A "Resume session" affordance surfaced on Home whenever an unfinished Live
// Session exists in the single `localStorage` slot (issue #91 — F2·S6, ADR-0012).
// Client-only: the slot lives in `localStorage`, so this reads it on mount and
// renders nothing during SSR and the first paint, then appears if there is a
// performance to pick back up. Finished-but-uncleared slots are not offered.
export function ResumeSessionBanner(): React.JSX.Element | null {
  const [sessionId, setSessionId] = useState<number | null>(null);

  useEffect(() => {
    const stored = readLiveSessionSlot();
    if (stored && stored.status !== "finished") {
      setSessionId(stored.sessionId);
    }
  }, []);

  if (sessionId === null) return null;

  return (
    <Card className="flex flex-col gap-3 border-cyan p-4">
      <span className="label-mono text-[11px] text-cyan">
        LIVE // SESSION IN PROGRESS
      </span>
      <p className="font-mono text-[13px] leading-relaxed text-text-secondary">
        You have an unfinished session. Pick up exactly where you left off.
      </p>
      <Link
        href={`/sessions/${sessionId}/live`}
        className={buttonVariants({ className: "w-full" })}
      >
        <Play className="h-4 w-4" />
        Resume session
      </Link>
    </Card>
  );
}
