"use client";

import { useDeferredValue, useEffect, useRef, useState, ViewTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Save,
  Unlink,
  WifiOff,
} from "@/components/pulse/icons";

import { useSyncStatus } from "@/lib/use-sync-status";
import { hasQueuedWork, type SyncState } from "@/lib/sync-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { persistentTransitionStyle } from "@/lib/persistent-transition";

// The honest connectivity + sync surface (issue #414 — ADR-0060). Mounted once under the
// signed-in shell alongside the OutboxSyncRegistrar, it renders the five distinct states the
// pure `deriveSyncState` seam decides — offline / saved-locally / syncing / synced / failed /
// orphaned — and never collapses them into one generic error. Non-blocking: a slim banner pinned above
// the bottom tab bar, never a modal, so it never interrupts training.
//
// "Synced" is the quiet default: with nothing queued it shows nothing, except a brief
// confirmation right after a finish actually lands (a real server ack), carrying the
// last-synced time. Offline, saved-locally, syncing and failed are always shown while they
// hold, because each is something the user should be able to see and (for failed and
// orphaned) act on.

// How long the "Synced" confirmation lingers after a finish lands before the banner goes
// quiet again — long enough to read, short enough not to nag.
const SYNCED_CONFIRMATION_MS = 5000;

// The active states that always show while they hold. `synced` is deliberately excluded —
// it is the quiet all-clear, surfaced only as a transient confirmation (below).
function isActiveState(state: SyncState): boolean {
  return state !== "synced";
}

export function SyncStatusBanner(): React.JSX.Element | null {
  const { state, summary, lastSyncedAt, retry, dismiss } = useSyncStatus();

  // Show "Synced" only as a brief confirmation after a real acknowledgement — i.e. when the
  // state transitions INTO synced from an active state. On a fresh load with nothing queued
  // (already synced), stay quiet. A ref tracks the prior state without re-rendering.
  const [showSynced, setShowSynced] = useState(false);
  const prevState = useRef<SyncState>(state);

  useEffect(() => {
    const cameFromActive = isActiveState(prevState.current);
    prevState.current = state;
    if (state === "synced" && cameFromActive) {
      setShowSynced(true);
      const timer = setTimeout(() => setShowSynced(false), SYNCED_CONFIRMATION_MS);
      return () => clearTimeout(timer);
    }
    if (state !== "synced") setShowSynced(false);
  }, [state]);

  // Quiet: all clear and no recent confirmation to show.
  const visible = state !== "synced" || showSynced;
  // The toast mounts and unmounts on a deferred copy of that decision (ADR-0124). A deferred
  // re-render is a Transition, so the toast's enter and exit animate; its inputs (connectivity,
  // the outbox read, the confirmation timer) are plain state updates that could not be. The lag
  // is one render, and on first mount the deferred value is the real one, so a toast that is
  // already true at load simply appears.
  const shown = useDeferredValue(visible);

  return (
    <div
      // `bottom-20` clears the fixed TabBar. At `lg:` the TabBar is gone (ADR-0088), so the
      // clearance goes with it and the toast sits at the bottom edge like any other.
      className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-6 lg:bottom-6"
      // Floats above the page and the chrome while a navigation transitions (ADR-0119).
      style={persistentTransitionStyle("syncToast")}
      // A status region: announced politely, never stealing focus. Always mounted, empty while
      // quiet, so the region exists before its message does — the pinned name above stays on a
      // node that outlives the toast, and the body animates inside it (ADR-0124).
      role="status"
      aria-live="polite"
    >
      {shown ? (
        <ViewTransition enter="toast-in" exit="toast-out" default="none">
          <BannerBody
            state={state}
            pendingCount={summary.pending + summary.syncing}
            failedCount={summary.failed}
            orphanedCount={summary.orphaned}
            offlineQueued={hasQueuedWork(summary)}
            lastSyncedAt={lastSyncedAt}
            onRetry={retry}
            onDismiss={dismiss}
          />
        </ViewTransition>
      ) : null}
    </div>
  );
}

interface BannerBodyProps {
  state: SyncState;
  pendingCount: number;
  failedCount: number;
  orphanedCount: number;
  offlineQueued: boolean;
  lastSyncedAt: number | null;
  onRetry: () => void;
  onDismiss: () => void;
}

// The per-state chrome. Each state gets its own icon, accent, and copy so they never
// read as one; `failed` carries the manual retry, `orphaned` a dismiss (no retry can help).
function BannerBody({
  state,
  pendingCount,
  failedCount,
  orphanedCount,
  offlineQueued,
  lastSyncedAt,
  onRetry,
  onDismiss,
}: BannerBodyProps): React.JSX.Element {
  const { icon: Icon, accent, spin } = STATE_CHROME[state];
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-shell items-center gap-2.5 rounded-sm border px-3.5 py-2.5 shadow-lg backdrop-blur",
        accent,
      )}
    >
      {/* The rotation is decoration: each state already has its own icon, accent
          and copy, so stopping it under prefers-reduced-motion loses nothing a
          reader relies on (ADR-0082). */}
      <Icon className={cn("h-4 w-4 shrink-0", spin && "animate-spin motion-reduce:animate-none")} aria-hidden />
      <div className="min-w-0 flex-1 font-mono text-[12px] leading-snug">
        {renderMessage(state, {
          pendingCount,
          failedCount,
          orphanedCount,
          offlineQueued,
          lastSyncedAt,
        })}
      </div>
      {state === "failed" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      ) : null}
      {state === "orphaned" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDismiss}
          className="shrink-0"
        >
          Dismiss
        </Button>
      ) : null}
    </div>
  );
}

interface MessageInputs {
  pendingCount: number;
  failedCount: number;
  orphanedCount: number;
  offlineQueued: boolean;
  lastSyncedAt: number | null;
}

// The honest copy per state. Kept out of the pure seam because it is presentation, but it
// leans entirely on the derived state so it can never contradict it (e.g. never "synced"
// while a finish is only saved on-device).
function renderMessage(
  state: SyncState,
  { pendingCount, failedCount, orphanedCount, offlineQueued, lastSyncedAt }: MessageInputs,
): React.JSX.Element {
  switch (state) {
    case "offline":
      return (
        <span className="text-text-secondary">
          <span className="font-semibold text-text-primary">You’re offline.</span>{" "}
          {offlineQueued
            ? "Your finished session is saved on this device and will sync when you reconnect."
            : "You can keep training — anything you finish is saved on this device."}
        </span>
      );
    case "saved-locally":
      return (
        <span className="text-text-secondary">
          <span className="font-semibold text-text-primary">
            Saved on this device
          </span>{" "}
          — sync pending{plural(pendingCount)}.
        </span>
      );
    case "syncing":
      return <span className="text-text-secondary">Syncing your session…</span>;
    case "synced":
      return (
        <span className="text-text-secondary">
          <span className="font-semibold text-cyan">Synced.</span>
          {lastSyncedAt !== null ? ` Last synced ${formatTime(lastSyncedAt)}.` : ""}
        </span>
      );
    case "failed":
      return (
        <span className="text-text-secondary">
          <span className="font-semibold text-magenta">Sync failed</span>
          {failedCount > 1 ? ` for ${failedCount} sessions` : ""}. Your work is safe
          on this device.
        </span>
      );
    case "orphaned":
      // No retry can save it (#636), so the copy says why and that nothing more will
      // happen, instead of the reassurance the retryable states give.
      return (
        <span className="text-text-secondary">
          <span className="font-semibold text-magenta">
            {orphanedCount > 1 ? `${orphanedCount} sessions` : "Session"} not saved.
          </span>{" "}
          {orphanedCount > 1
            ? "Their plans no longer exist — deleted, maybe on another device — so these workouts can’t be saved."
            : "Its plan no longer exists — deleted, maybe on another device — so this workout can’t be saved."}
        </span>
      );
  }
}

// " (2)" when more than one finish is queued, "" for a single one — so the common single
// case reads cleanly without a count.
function plural(count: number): string {
  return count > 1 ? ` (${count})` : "";
}

// A friendly local wall-clock time for the last acknowledgement (locale/zone from the
// reader's browser). Time-only is enough: "Last synced 10:42 AM".
function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

interface StateChrome {
  icon: React.ElementType;
  // Border + background + text accent, keeping each state visually distinct.
  accent: string;
  spin?: boolean;
}

// One visual identity per state — distinct icon and accent, so offline (violet), pending
// (neutral), syncing (cyan, spinning), synced (cyan), and failed (magenta) never blur into
// each other.
const STATE_CHROME: Record<SyncState, StateChrome> = {
  offline: {
    icon: WifiOff,
    accent: "border-violet/40 bg-violet-dim text-violet",
  },
  "saved-locally": {
    icon: Save,
    accent: "border-border bg-surface/95 text-text-secondary",
  },
  syncing: {
    icon: RefreshCw,
    accent: "border-cyan/40 bg-cyan-dim text-cyan",
    spin: true,
  },
  synced: {
    icon: CheckCircle2,
    accent: "border-cyan/40 bg-cyan-dim text-cyan",
  },
  failed: {
    icon: AlertTriangle,
    accent: "border-magenta/40 bg-magenta-dim text-magenta",
  },
  orphaned: {
    icon: Unlink,
    accent: "border-magenta/40 bg-magenta-dim text-magenta",
  },
};
