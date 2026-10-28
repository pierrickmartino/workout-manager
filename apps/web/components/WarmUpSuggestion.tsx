"use client";

import { useReducer, useTransition } from "react";
import { Loader2, Plus, RefreshCw, X, Zap } from "@/components/pulse/icons";

import { requestWarmUpSuggestion, submitWarmUp } from "@/app/sessions/[id]/actions";
import { ConfirmDialog } from "@/components/pulse/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useConnectivity } from "@/lib/use-connectivity";
import type { WorkoutSession } from "@/lib/sessions-types";
import type { WeightUnit } from "@/lib/weight-unit";
import {
  WARM_UP_REPLACE_CONFIRMATION,
  WARM_UP_REPLACE_CONFIRM_LABEL,
  initialWarmUpState,
  warmUpAddLabel,
  warmUpButtonView,
  warmUpPreview,
  warmUpReducer,
  type WarmUpButtonView,
  type WarmUpSuggestion as WarmUpSuggestionPayload,
} from "@/lib/warm-up-suggestion";

interface WarmUpSuggestionProps {
  session: WorkoutSession;
  unit: WeightUnit;
}

// The Session preview's Warm-up Suggestion (ADR-0143, #778). Add (#780) saves the drills as the
// Session's leading Warm-up Section; the server action revalidates the page, so the plan below
// re-renders with them. When the Session already opens with a Warm-up Section, Add reads Replace
// and the app's own `ConfirmDialog` guards it (#782).
export function WarmUpSuggestion({ session, unit }: WarmUpSuggestionProps) {
  const online = useConnectivity();
  return (
    <WarmUpPanel
      sessionId={session.id}
      button={warmUpButtonView(session, online)}
      online={online}
      unit={unit}
    />
  );
}

interface WarmUpPanelProps {
  sessionId: number;
  button: WarmUpButtonView;
  online: boolean;
  unit: WeightUnit;
  // Why Add is locked right now (the Live Session, #783), or null when it is allowed.
  addLockedNote?: string | null;
  // Runs after the drills are saved (the Live Session reloads itself, #783).
  onAdded?: () => void;
}

// The shared Warm-up Suggestion panel: a button that asks the AI for 4–6 drills, a loading
// state, the preview with Add, Discard and Regenerate, and an error with Retry. The caller
// decides the button's visibility and label; every rule lives in the view-models.
export function WarmUpPanel({
  sessionId,
  button,
  online,
  unit,
  addLockedNote = null,
  onAdded,
}: WarmUpPanelProps) {
  const [state, dispatch] = useReducer(warmUpReducer, initialWarmUpState);
  const [, startTransition] = useTransition();

  if (!button.visible) return null;

  const request = (regenerate: boolean) => {
    dispatch({ type: "requested", regenerate });
    startTransition(async () => {
      const result = await requestWarmUpSuggestion(sessionId, regenerate);
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

  const add = (suggestion: WarmUpSuggestionPayload) => {
    dispatch({ type: "addRequested" });
    // A replacement waits for confirmation first; only a step that reaches `adding` saves.
    if (warmUpReducer(state, { type: "addRequested" }).status !== "adding") return;
    startTransition(async () => {
      const result = await submitWarmUp(sessionId, suggestion.drills);
      dispatch(result.ok ? { type: "added" } : { type: "addFailed", message: result.message });
      if (result.ok) onAdded?.();
    });
  };

  if (
    state.status === "ready" ||
    state.status === "confirmingReplace" ||
    state.status === "adding" ||
    state.status === "addError"
  ) {
    const preview = warmUpPreview(state.suggestion, unit);
    const adding = state.status === "adding";
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
          <Button
            type="button"
            size="sm"
            disabled={!online || adding || addLockedNote !== null}
            onClick={() => add(state.suggestion)}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {warmUpAddLabel(state)}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!online || adding}
            onClick={() => request(true)}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Regenerate
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={adding}
            onClick={() => dispatch({ type: "discarded" })}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Discard
          </Button>
        </div>
        {addLockedNote ? (
          <span className="font-mono text-[12px] text-text-muted">{addLockedNote}</span>
        ) : null}
        {state.status === "addError" ? (
          <span role="alert" className="font-mono text-[12px] text-magenta">
            {state.message}
          </span>
        ) : null}
        {state.status === "confirmingReplace" ? (
          <ConfirmDialog
            title="Replace warm-up?"
            message={WARM_UP_REPLACE_CONFIRMATION}
            confirmLabel={WARM_UP_REPLACE_CONFIRM_LABEL}
            cancelLabel="Keep current"
            onCancel={() => dispatch({ type: "replaceCancelled" })}
            onConfirm={() => add(state.suggestion)}
          />
        ) : null}
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
