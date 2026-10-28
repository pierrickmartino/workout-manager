"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/pulse/alert";
import { WarmUpPanel } from "@/components/WarmUpSuggestion";
import {
  afterLiveWarmUpAdded,
  liveWarmUpAddLockedNote,
  liveWarmUpButtonView,
} from "@/lib/live-warm-up";
import type { LiveSessionState } from "@/lib/live-session";
import { clearLiveSessionSlot } from "@/lib/live-session-storage";
import type { WorkoutSession } from "@/lib/sessions-types";
import { useConnectivity } from "@/lib/use-connectivity";
import type { WeightUnit } from "@/lib/weight-unit";

interface LiveWarmUpSuggestionProps {
  session: WorkoutSession;
  state: LiveSessionState;
  unit: WeightUnit;
}

// The Warm-up Suggestion at the start of a Live Session (ADR-0144, #783). Once the drills are
// saved, the performance is reloaded through the live load path: the slot is released (nothing
// is completed, so nothing is lost) and the page re-reads the updated Session, so the drills are
// never merged on the client (ADR-0012). The suggestion lives only in component state; the slot
// holds only the Live Session state (ADR-0035). Every rule lives in `lib/live-warm-up`.
export function LiveWarmUpSuggestion({ session, state, unit }: LiveWarmUpSuggestionProps) {
  const online = useConnectivity();
  const [keptNote, setKeptNote] = useState<string | null>(null);
  // The save resolves after an await, so it reads the performance as it is then, not as it was
  // at the tap: a set completed meanwhile must not be thrown away by a reload.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const onAdded = useCallback(() => {
    const next = afterLiveWarmUpAdded(latest.current);
    if (next.kind === "keep") {
      setKeptNote(next.note);
      return;
    }
    clearLiveSessionSlot();
    window.location.reload();
  }, []);

  return (
    <>
      <WarmUpPanel
        sessionId={session.id}
        button={liveWarmUpButtonView(session, state, online)}
        online={online}
        unit={unit}
        addLockedNote={liveWarmUpAddLockedNote(state)}
        onAdded={onAdded}
      />
      {keptNote ? (
        <Alert announce tone="info">
          {keptNote}
        </Alert>
      ) : null}
    </>
  );
}
