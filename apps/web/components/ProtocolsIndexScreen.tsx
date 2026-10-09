"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

import { readLiveSessionSlot } from "@/lib/live-session-storage";
import {
  protocolsIndex,
  type LiveSessionContext,
  type ProtocolIndexEntry,
} from "@/lib/protocols-index";
import { ProtocolsIndex } from "@/components/ProtocolsIndex";

// The Protocols index page's client shell (issue #638). The Live Session slot lives in
// `localStorage` (ADR-0012), which the server cannot see, so the slot is read here once auth
// has resolved and handed to the view-model, which decides whether Switch is blocked. Until
// then nothing is blocked; the server still refuses a Finished or unowned Protocol either way.
export function ProtocolsIndexScreen({
  entries,
}: {
  entries: readonly ProtocolIndexEntry[];
}): React.JSX.Element {
  const { userId, isLoaded } = useAuth();
  const [live, setLive] = useState<LiveSessionContext | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    setLive({ liveSlot: readLiveSessionSlot(), accountId: userId ?? null });
  }, [isLoaded, userId]);

  return <ProtocolsIndex index={protocolsIndex(entries, live)} />;
}
