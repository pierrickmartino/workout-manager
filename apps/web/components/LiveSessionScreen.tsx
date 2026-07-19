"use client";

import Link from "next/link";
import { useEffect, useReducer, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Flag,
  Minus,
  Plus,
  Play,
  SkipForward,
  Timer,
} from "lucide-react";

import {
  finishLiveSession,
  recordLiveSession,
  type FinishState,
} from "@/app/sessions/[id]/live/actions";
import {
  initLiveSession,
  liveSessionReducer,
  resolveLiveEntry,
  completionOutcome,
  progressPercent,
  currentUnit,
  currentSuperset,
  nextExercise,
  type LiveSet,
  type LiveSessionState,
} from "@/lib/live-session";
import { mapFinishToLog } from "@/lib/live-session-mapper";
import {
  readLiveSessionSlot,
  writeLiveSessionSlot,
  clearLiveSessionSlot,
} from "@/lib/live-session-storage";
import {
  durationSeconds,
  elapsedSeconds,
  formatElapsed,
  resolveRestSeconds,
  restTargetEnd,
  restRemainingSeconds,
  adjustRestTargetEnd,
  REST_ADJUST_STEP_SECONDS,
} from "@/lib/live-timer";
import { LOAD_KIND_OPTIONS, type LoadKind } from "@/lib/load";
import type { WorkoutSession } from "@/lib/sessions-types";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { SegmentedBar } from "@/components/pulse/segmented-bar";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";

const RPE_VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

interface LiveSessionScreenProps {
  session: WorkoutSession;
  today: string;
  // The user's default rest-timer duration in whole seconds (issue #121), or null
  // when unset — then each set's rest falls back to the prescription's own value.
  defaultRestSeconds: number | null;
}

// The screen's lifecycle, decided on the first foreground from the persisted slot
// (issue #91 — F2·S6): `deciding` until the entry is resolved, then the running
// performance, a summary for an idle auto-ended session, or a block when a
// different unfinished session must be resumed or ended first.
type Phase = "deciding" | "live" | "summary" | "blocked";

// Runs a Session live and records it per set (issue #86 — F2·S1), surviving refresh
// and phone-lock via a single `localStorage` slot with resume, idle auto-end, and
// single-session enforcement (issue #91 — F2·S6). The pure engine (lib/live-session)
// holds the record being built and decides the entry; this screen is a thin shell
// that persists state, dispatches events, and reads the header derivations. On
// Finish it maps the state to the log payload and hands it to the server action.
export function LiveSessionScreen({
  session,
  today,
  defaultRestSeconds,
}: LiveSessionScreenProps) {
  const [state, dispatch] = useReducer(
    liveSessionReducer,
    session,
    initLiveSession,
  );
  const [finishState, setFinishState] = useState<FinishState>({ error: null });
  const [pending, startTransition] = useTransition();
  // The lifecycle phase, plus the states the non-live phases render from: the
  // idle-ended performance for the summary, and the other unfinished session that
  // blocks starting this one.
  const [phase, setPhase] = useState<Phase>("deciding");
  const [summary, setSummary] = useState<LiveSessionState | null>(null);
  const [blockedExisting, setBlockedExisting] =
    useState<LiveSessionState | null>(null);
  // A wall-clock "now" that ticks each second. The elapsed timer is always derived
  // from `state.startedAt` vs this value (never a decrementing counter), so a
  // backgrounded or locked tab shows the correct time on return (ADR-0014).
  const [now, setNow] = useState(() => Date.now());
  // The rest countdown between sets (issue #89 — F2·S4). A stored target-end
  // timestamp — null when no rest is running — compared to the ticking `now`, so
  // like the elapsed timer it survives a phone lock. Purely client-side: rest is
  // never written to the record.
  const [restEndAt, setRestEndAt] = useState<number | null>(null);

  // Resolve what arriving at this live route does, from the single persisted slot
  // (ADR-0012). Runs once on the first foreground — the idle guard (ADR-0014) is
  // evaluated here, never on a background timer, so the user experiences "I came
  // back after 40 minutes and it had ended my workout" on return, not while away.
  useEffect(() => {
    const entry = resolveLiveEntry(readLiveSessionSlot(), session.id, Date.now());
    switch (entry.kind) {
      case "start_fresh":
        // A fresh performance: START stamps the instant Session Duration measures
        // from (not_started → in_progress).
        dispatch({ type: "START", now: Date.now() });
        setPhase("live");
        break;
      case "resume":
        // Restore the persisted performance exactly — set table, current set, and
        // the timestamps backing the elapsed timer.
        dispatch({ type: "HYDRATE", state: entry.state });
        setPhase("live");
        break;
      case "auto_end":
        endIdleSession(entry.state);
        break;
      case "blocked":
        setBlockedExisting(entry.existing);
        setPhase("blocked");
        break;
    }
    // Only the initial mount decides the entry; `session.id`/`today` are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist every state change while the performance is live, so a refresh or lock
  // resumes exactly here. Non-live phases (summary/blocked) never write.
  useEffect(() => {
    if (phase === "live") writeLiveSessionSlot(state);
  }, [state, phase]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Finalize an idle-expired performance as Incomplete (ADR-0014): record the
  // completed sets (idle-excluded duration) and show a summary instead of resuming.
  // The slot is cleared only once the record succeeds — a failed POST keeps the
  // slot so the next foreground retries the auto-end rather than losing the sets.
  function endIdleSession(stored: LiveSessionState) {
    const finished = liveSessionReducer(stored, { type: "FINISH" });
    setSummary(finished);
    setPhase("summary");
    const payload = mapFinishToLog(finished, today);
    if (!payload) {
      // No completed set to record — nothing to persist, so just drop the slot.
      clearLiveSessionSlot();
      return;
    }
    startTransition(async () => {
      const result = await recordLiveSession(stored.sessionId, payload);
      if (result?.error) {
        setFinishState({ error: result.error });
        return;
      }
      clearLiveSessionSlot();
    });
  }

  // End the other unfinished session that blocks this one: record it as-is (no work
  // discarded — ADR-0012), then start this Session fresh in place. The slot is
  // cleared only after a successful record, so a failed POST keeps that session's
  // work intact and the user stays on the block to retry.
  function handleEndExisting() {
    const existing = blockedExisting;
    if (!existing) return;
    const finished = liveSessionReducer(existing, { type: "FINISH" });
    const payload = mapFinishToLog(finished, today);
    startTransition(async () => {
      if (payload) {
        const result = await recordLiveSession(existing.sessionId, payload);
        if (result?.error) {
          setFinishState({ error: result.error });
          return;
        }
      }
      clearLiveSessionSlot();
      setBlockedExisting(null);
      dispatch({ type: "START", now: Date.now() });
      setPhase("live");
    });
  }

  const restRemaining = restRemainingSeconds(restEndAt, now);
  const isResting = restEndAt !== null;

  // When the running rest elapses, resume into the next set by clearing it — the
  // current-set pointer already moved on set completion, so the next set is simply
  // revealed once the countdown card disappears.
  useEffect(() => {
    if (restEndAt !== null && restRemainingSeconds(restEndAt, now) === 0) {
      setRestEndAt(null);
    }
  }, [restEndAt, now]);

  const percent = progressPercent(state);
  const unit = currentUnit(state);
  const superset = currentSuperset(state);
  const upcoming = nextExercise(state);
  const completedCount = state.sets.filter((s) => s.status === "completed").length;
  const elapsed = formatElapsed(elapsedSeconds(state.startedAt, now));

  function handleCompleteSet(
    index: number,
    reps: number,
    loadKind: LoadKind,
    loadValue: string,
    rpe: number | null,
  ) {
    const completedAt = Date.now();
    const set = state.sets[index];
    dispatch({
      type: "COMPLETE_SET",
      index,
      reps,
      loadKind,
      loadValue,
      rpe,
      now: completedAt,
    });
    // Auto-start a rest countdown, but only while sets remain and this set actually
    // rests after it. A Superset rests only at the round boundary (ADR-0023), so a
    // set in the middle of a round (`restsAfter` false) flows straight to its
    // co-member; the engine also carries the rest to use (round-rest vs the module's
    // own), with the user's default taking precedence.
    const morePending = state.sets.some(
      (s, i) => i !== index && s.status === "pending",
    );
    if (morePending && set.restsAfter) {
      const rest = resolveRestSeconds(set.restSeconds, defaultRestSeconds);
      setRestEndAt(restTargetEnd(completedAt, rest));
    }
  }

  // The `−15 / +15` controls shift the running rest's target-end; a shift never
  // banks time before now (see adjustRestTargetEnd).
  function adjustRest(deltaSeconds: number) {
    setRestEndAt((prev) =>
      prev === null ? prev : adjustRestTargetEnd(prev, deltaSeconds, Date.now()),
    );
  }

  function handleFinish() {
    const snapshot = state;
    const payload = mapFinishToLog(snapshot, today);
    // Clear the slot up front: the success path redirects to history and never
    // returns here, so an uncleared slot would otherwise re-offer to "resume" an
    // already-logged session. On failure the snapshot is written back below.
    clearLiveSessionSlot();
    startTransition(async () => {
      const result = await finishLiveSession(session.id, payload);
      if (result?.error) {
        setFinishState({ error: result.error });
        writeLiveSessionSlot(snapshot);
      }
    });
  }

  // Before the entry is resolved (SSR and the first client render), show a stable
  // placeholder — the resume-vs-auto-end decision needs `localStorage`, which is
  // client-only, so nothing performance-specific renders until the effect runs.
  if (phase === "deciding") {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader
          overline="PULSE // LIVE"
          title={<span className="capitalize">{session.training_type}</span>}
        />
        <Card className="p-4">
          <p className="font-mono text-[13px] text-text-secondary">
            Preparing session…
          </p>
        </Card>
      </section>
    );
  }

  // A different unfinished session blocks starting this one (ADR-0012): resume it
  // or end it first — never silently supersede real work.
  if (phase === "blocked" && blockedExisting) {
    return (
      <BlockedPrompt
        session={session}
        existing={blockedExisting}
        error={finishState.error}
        pending={pending}
        onEndExisting={handleEndExisting}
      />
    );
  }

  // An idle-expired performance was auto-ended as Incomplete (ADR-0014): show a
  // summary of what was recorded rather than resuming.
  if (phase === "summary" && summary) {
    return (
      <IdleEndedSummary
        session={session}
        summary={summary}
        error={finishState.error}
      />
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // LIVE"
        title={<span className="capitalize">{session.training_type}</span>}
        action={
          <Badge variant="cyan">
            {superset
              ? `SUPERSET ${superset.label} · ROUND ${superset.round}/${superset.totalRounds}`
              : `MODULE ${unit.index}/${unit.total}`}
          </Badge>
        }
      />

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label-mono text-[11px] text-text-muted">
            PROGRESS
          </span>
          <span
            className="flex items-center gap-1.5 font-mono text-[13px] font-bold text-text-primary"
            aria-label="Elapsed time"
          >
            <Clock className="h-3.5 w-3.5 text-text-muted" aria-hidden />
            {elapsed}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <SegmentedBar value={percent / 100} className="flex-1" />
          <span className="ml-3 font-mono text-[13px] font-bold text-cyan">
            {percent}%
          </span>
        </div>
        <p className="font-mono text-[12px] text-text-secondary">
          {upcoming ? (
            <>
              Next up: <span className="text-text-primary">{upcoming}</span>
            </>
          ) : (
            "Final exercise"
          )}
        </p>
      </Card>

      {finishState.error ? (
        <Alert tone="error">{finishState.error}</Alert>
      ) : null}

      {isResting ? (
        <Card className="flex flex-col gap-3 border-cyan p-4">
          <div className="flex items-center justify-between">
            <span className="label-mono flex items-center gap-1.5 text-[11px] text-text-muted">
              <Timer className="h-3.5 w-3.5" aria-hidden />
              REST
            </span>
            <span
              className="font-mono text-[28px] font-bold leading-none text-cyan"
              aria-label="Rest remaining"
            >
              {formatElapsed(restRemaining)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => adjustRest(-REST_ADJUST_STEP_SECONDS)}
              aria-label={`Subtract ${REST_ADJUST_STEP_SECONDS} seconds of rest`}
            >
              <Minus className="h-3.5 w-3.5" />
              {REST_ADJUST_STEP_SECONDS}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRestEndAt(null)}
              aria-label="Skip rest"
            >
              <SkipForward className="h-3.5 w-3.5" />
              Skip
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => adjustRest(REST_ADJUST_STEP_SECONDS)}
              aria-label={`Add ${REST_ADJUST_STEP_SECONDS} seconds of rest`}
            >
              <Plus className="h-3.5 w-3.5" />
              {REST_ADJUST_STEP_SECONDS}
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        <SectionHeader meta={`${completedCount}/${state.sets.length} SETS`}>
          SETS
        </SectionHeader>
        <ol className="flex list-none flex-col gap-3 p-0">
          {state.sets.map((set, index) => (
            <li key={`${set.modulePosition}-${set.setNumber}`}>
              <SetRow
                set={set}
                isCurrent={index === state.currentIndex}
                onComplete={(reps, loadKind, loadValue, rpe) =>
                  handleCompleteSet(index, reps, loadKind, loadValue, rpe)
                }
                onSkip={() => dispatch({ type: "ADVANCE" })}
              />
            </li>
          ))}
        </ol>
      </div>

      <Button
        type="button"
        onClick={handleFinish}
        disabled={pending}
        className="w-full"
      >
        <Flag className="h-4 w-4" />
        {pending ? "Finishing…" : "Finish session"}
      </Button>

      <BackLink href={`/sessions/${session.id}`}>Back to session</BackLink>
    </section>
  );
}

interface BlockedPromptProps {
  session: WorkoutSession;
  existing: LiveSessionState;
  error: string | null;
  pending: boolean;
  onEndExisting: () => void;
}

// The single-session guard (ADR-0012): another performance is unfinished, so
// starting this one is blocked. The user resumes that one or ends it first — its
// completed sets are recorded on End, never discarded.
function BlockedPrompt({
  session,
  existing,
  error,
  pending,
  onEndExisting,
}: BlockedPromptProps): React.JSX.Element {
  const completed = existing.sets.filter((s) => s.status === "completed").length;
  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // LIVE"
        title={<span className="capitalize">{session.training_type}</span>}
        action={<Badge variant="magenta">BLOCKED</Badge>}
      />

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card className="flex flex-col gap-4 border-magenta/50 p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-sm bg-magenta-dim">
          <AlertTriangle className="h-5 w-5 text-magenta" aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Another session is in progress
          </h2>
          <p className="font-mono text-[13px] leading-relaxed text-text-muted">
            You have {completed} set{completed === 1 ? "" : "s"} recorded in an
            unfinished session. Resume it, or end it first — your completed sets
            are kept either way.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <Link
            href={`/sessions/${existing.sessionId}/live`}
            className={buttonVariants({ className: "w-full" })}
          >
            <Play className="h-4 w-4" />
            Resume current session
          </Link>
          <Button
            type="button"
            variant="secondary"
            onClick={onEndExisting}
            disabled={pending}
            className="w-full"
          >
            <Flag className="h-4 w-4" />
            {pending ? "Ending…" : "End it and start this one"}
          </Button>
        </div>
      </Card>

      <BackLink href={`/sessions/${session.id}`}>Back to session</BackLink>
    </section>
  );
}

interface IdleEndedSummaryProps {
  session: WorkoutSession;
  summary: LiveSessionState;
  error: string | null;
}

// The idle auto-end summary (ADR-0014): the user returned after >30 minutes, so
// the performance was finalized as Incomplete. The completed sets and the
// idle-excluded duration are what got recorded — shown here instead of resuming.
function IdleEndedSummary({
  session,
  summary,
  error,
}: IdleEndedSummaryProps): React.JSX.Element {
  const completed = summary.sets.filter((s) => s.status === "completed").length;
  const total = summary.sets.length;
  const duration = durationSeconds(summary.startedAt, summary.lastActivityAt);
  const outcome = completionOutcome(summary);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // LIVE"
        title={<span className="capitalize">{session.training_type}</span>}
        action={
          <Badge variant={outcome === "incomplete" ? "magenta" : "cyan"}>
            {outcome === "incomplete" ? "INCOMPLETE" : "COMPLETED"}
          </Badge>
        }
      />

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Session ended after inactivity
          </h2>
          <p className="font-mono text-[13px] leading-relaxed text-text-muted">
            You were away for more than 30 minutes, so this session was ended and
            recorded as Incomplete. Your completed sets were saved — run the whole
            session again to advance your protocol.
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="label-mono text-[11px] text-text-muted">SETS DONE</span>
          <span className="font-mono text-[13px] font-bold text-text-primary">
            {completed}/{total}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="label-mono text-[11px] text-text-muted">DURATION</span>
          <span className="flex items-center gap-1.5 font-mono text-[13px] font-bold text-text-primary">
            <Clock className="h-3.5 w-3.5 text-text-muted" aria-hidden />
            {duration === null ? "—" : formatElapsed(duration)}
          </span>
        </div>
      </Card>

      <Link
        href="/history"
        className={buttonVariants({ className: "w-full" })}
      >
        View training history
      </Link>
      <BackLink href={`/sessions/${session.id}`}>Back to session</BackLink>
    </section>
  );
}

interface SetRowProps {
  set: LiveSet;
  isCurrent: boolean;
  onComplete: (
    reps: number,
    loadKind: LoadKind,
    loadValue: string,
    rpe: number | null,
  ) => void;
  onSkip: () => void;
}

// One prescribed set. Its edited reps/load/RPE live as local input state, seeded
// from the prescription pre-fill; "Complete" folds those values into a
// COMPLETE_SET event (the engine's only editing path). "Skip" leaves the set
// un-attempted (ADVANCE) — finishing with any skipped set records the performance
// Incomplete (ADR-0013).
function SetRow({ set, isCurrent, onComplete, onSkip }: SetRowProps) {
  const [reps, setReps] = useState(String(set.reps));
  const [loadKind, setLoadKind] = useState<LoadKind>(set.loadKind);
  const [loadValue, setLoadValue] = useState(set.loadValue);
  const [rpe, setRpe] = useState(set.rpe === null ? "" : String(set.rpe));

  const completed = set.status === "completed";
  const label = `${set.exerciseName}, set ${set.setNumber}`;

  function handleComplete() {
    const repsValue = Number.parseInt(reps, 10);
    const rpeValue = rpe === "" ? null : Number.parseInt(rpe, 10);
    onComplete(
      Number.isInteger(repsValue) && repsValue >= 0 ? repsValue : 0,
      loadKind,
      loadValue.trim(),
      rpeValue !== null && Number.isInteger(rpeValue) ? rpeValue : null,
    );
  }

  return (
    <Card
      className={
        completed
          ? "flex flex-col gap-3 border-cyan/40 bg-surface p-4 opacity-80"
          : isCurrent
            ? "flex flex-col gap-3 border-cyan p-4"
            : "flex flex-col gap-3 p-4"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-base font-mono text-[12px] font-bold text-cyan">
            {set.setNumber}/{set.moduleSetCount}
          </span>
          <span className="font-display text-[15px] font-semibold text-text-primary">
            {set.exerciseName}
          </span>
        </div>
        {completed ? (
          <Badge variant="cyan">
            <Check className="h-3 w-3" aria-hidden />
            DONE
          </Badge>
        ) : null}
      </div>

      <p className="font-mono text-[11px] text-text-muted">
        Prescribed: {set.prescribedReps} reps · {set.prescribedLoadText}
      </p>

      {set.previous ? (
        <p className="font-mono text-[11px] text-cyan/80">
          Previous: {set.previous.reps} reps · {set.previous.loadText}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Reps</span>
          <Input
            type="number"
            min={0}
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            disabled={completed}
            aria-label={`Reps for ${label}`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">RPE</span>
          <Select
            value={rpe}
            onChange={(event) => setRpe(event.target.value)}
            disabled={completed}
            aria-label={`RPE for ${label}`}
          >
            <option value="">—</option>
            {RPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="grid grid-cols-[7rem_1fr] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">
            Load kind
          </span>
          <Select
            value={loadKind}
            onChange={(event) => setLoadKind(event.target.value as LoadKind)}
            disabled={completed}
            aria-label={`Load kind for ${label}`}
          >
            {LOAD_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-mono text-[9px] text-text-muted">Load</span>
          <Input
            value={loadValue}
            onChange={(event) => setLoadValue(event.target.value)}
            disabled={completed}
            placeholder="70"
            aria-label={`Load for ${label}`}
          />
        </label>
      </div>

      {!completed ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleComplete}
          >
            <Check className="h-3.5 w-3.5" />
            Complete set
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSkip}
            aria-label={`Skip ${label}`}
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
