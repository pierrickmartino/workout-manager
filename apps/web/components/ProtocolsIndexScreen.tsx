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
// then Switch is pending, so it can't be pressed before a Live Session has been ruled out.
interface ProtocolsIndexScreenProps {
  entries: readonly ProtocolIndexEntry[];
}

export function ProtocolsIndexScreen({ entries }: ProtocolsIndexScreenProps): React.JSX.Element {
  const { userId, isLoaded } = useAuth();
  // Null until the slot has been read, which the view-model renders as a pending Switch.
  const [live, setLive] = useState<LiveSessionContext | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    setLive({ liveSlot: readLiveSessionSlot(), accountId: userId ?? null });
  }, [isLoaded, userId]);

  return <ProtocolsIndex index={protocolsIndex(entries, live)} />;
}
