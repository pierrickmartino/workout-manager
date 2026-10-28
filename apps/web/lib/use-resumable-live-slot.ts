"use client";

import { useAuth } from "@clerk/nextjs";
import { startTransition, useEffect, useState } from "react";

import { resumableLiveSlot, type LiveSessionState } from "./live-session.ts";
import { readLiveSessionSlot } from "./live-session-storage.ts";

// The signed-in account's Live Session in progress, read from client storage once auth
// resolves (ADR-0012, ADR-0059): `undefined` while unread (the server render and the first
// paint cannot see `localStorage`), `null` when none is in progress, else the slot. The one
// read Home's Resume banner and the Session page's Equipment Substitution guard share. The
// update runs in a Transition so a surface arriving after hydration animates (ADR-0124).
export function useResumableLiveSlot(): LiveSessionState | null | undefined {
  const { userId, isLoaded } = useAuth();
  const [slot, setSlot] = useState<LiveSessionState | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    const stored = resumableLiveSlot(readLiveSessionSlot(), userId ?? null);
    startTransition(() => setSlot(stored));
  }, [isLoaded, userId]);

  return slot;
}
