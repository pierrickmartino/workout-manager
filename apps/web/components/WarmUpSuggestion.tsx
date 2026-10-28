"use client";

import { useReducer, useTransition } from "react";
import { Loader2, RefreshCw, X, Zap } from "@/components/pulse/icons";

import { requestWarmUpSuggestion } from "@/app/sessions/[id]/actions";
import { Button } from "@/components/ui/button";
import { useConnectivity } from "@/lib/use-connectivity";
import type { WorkoutSession } from "@/lib/sessions-types";
import type { WeightUnit } from "@/lib/weight-unit";
import {
  initialWarmUpState,
  warmUpButtonView,
  warmUpPreview,
  warmUpReducer,
} from "@/lib/warm-up-suggestion";

interface WarmUpSuggestionProps {
  session: WorkoutSession;
  unit: WeightUnit;
}

// The Session preview's Warm-up Suggestion (ADR-0143, #778): a button that asks the AI for 4–6
// drills, a loading state, the preview with Discard and Regenerate, and an error with Retry.
// A preview only — the Session is never changed here. Every rule lives in the view-model.
export function WarmUpSuggestion({ session, unit }: WarmUpSuggestionProps) {
  const [state, dispatch] = useReducer(warmUpReducer, initialWarmUpState);
  const [, startTransition] = useTransition();
  const online = useConnectivity();
  const button = warmUpButtonView(session, online);

  if (!button.visible) return null;

  const request = (regenerate: boolean) => {
    dispatch({ type: "requested", regenerate });
    startTransition(async () => {
      const result = await requestWarmUpSuggestion(session.id, regenerate);
      dispatch(
        result.ok
          ? { type: "succeeded", suggestion: result.suggestion }
          : { type: "failed", message: result.message },
      );
    });
  };

  if (state.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 font-mono text-[12px] text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin text-cyan motion-reduce:animate-none" aria-hidden />
        Finding a warm-up…
      </p>
    );
  }

  if (state.status === "ready") {
    const preview = warmUpPreview(state.suggestion, unit);
    return (
      <div className="flex flex-col gap-3 rounded-sm border border-border-lite bg-base p-3">
        <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-cyan">
          Warm-up suggestion · {preview.summary}
        </span>
        <ul className="flex flex-col gap-2">
          {preview.rows.map((row) => (
            <li key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 font-sans text-[14px] text-text-primary">{row.name}</span>
              <span className="font-mono text-[12px] text-text-secondary">
                {row.amount} · {row.load}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={!online} onClick={() => request(true)}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Regenerate
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => dispatch({ type: "discarded" })}>
            <X className="h-3.5 w-3.5" aria-hidden />
            Discard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={button.disabled}
        onClick={() => request(state.status === "error" ? state.regenerate : false)}
      >
        <Zap className="h-3.5 w-3.5" aria-hidden />
        {state.status === "error" ? "Retry" : button.label}
      </Button>
      {button.offlineNote ? (
        <span className="font-mono text-[12px] text-text-muted">{button.offlineNote}</span>
      ) : null}
      {state.status === "error" ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.message}
        </span>
      ) : null}
    </div>
  );
}
