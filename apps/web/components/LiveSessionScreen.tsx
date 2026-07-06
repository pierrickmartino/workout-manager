"use client";

import { useEffect, useReducer, useState, useTransition } from "react";
import { Check, Flag } from "lucide-react";

import {
  finishLiveSession,
  type FinishState,
} from "@/app/sessions/[id]/live/actions";
import {
  initLiveSession,
  liveSessionReducer,
  progressPercent,
  currentModule,
  nextExercise,
  type LiveSet,
  type LiveSessionState,
} from "@/lib/live-session";
import { mapFinishToLog } from "@/lib/live-session-mapper";
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
import { Button } from "@/components/ui/button";

const RPE_VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

interface LiveSessionScreenProps {
  session: WorkoutSession;
  today: string;
}

// Runs a Session live and records it per set (issue #86 — F2·S1). The pure engine
// (lib/live-session) holds the record being built; this screen is a thin shell
// that dispatches events and reads the header derivations. On Finish it maps the
// state to the log payload and hands it to the server action.
export function LiveSessionScreen({ session, today }: LiveSessionScreenProps) {
  const [state, dispatch] = useReducer(
    liveSessionReducer,
    session,
    initLiveSession,
  );
  const [finishState, setFinishState] = useState<FinishState>({ error: null });
  const [pending, startTransition] = useTransition();

  // Arriving at /live starts the performance (not_started → in_progress).
  useEffect(() => {
    dispatch({ type: "START" });
  }, []);

  const percent = progressPercent(state);
  const module = currentModule(state);
  const upcoming = nextExercise(state);
  const completedCount = state.sets.filter((s) => s.status === "completed").length;

  function handleFinish() {
    const payload = mapFinishToLog(state, today);
    startTransition(async () => {
      const result = await finishLiveSession(session.id, payload);
      if (result?.error) setFinishState({ error: result.error });
    });
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        overline="PULSE // LIVE"
        title={<span className="capitalize">{session.training_type}</span>}
        action={
          <Badge variant="cyan">
            MODULE {module.index}/{module.total}
          </Badge>
        }
      />

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label-mono text-[11px] text-text-muted">
            PROGRESS
          </span>
          <span className="font-mono text-[13px] font-bold text-cyan">
            {percent}%
          </span>
        </div>
        <SegmentedBar value={percent / 100} />
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
                  dispatch({
                    type: "COMPLETE_SET",
                    index,
                    reps,
                    loadKind,
                    loadValue,
                    rpe,
                  })
                }
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

interface SetRowProps {
  set: LiveSet;
  isCurrent: boolean;
  onComplete: (
    reps: number,
    loadKind: LoadKind,
    loadValue: string,
    rpe: number | null,
  ) => void;
}

// One prescribed set. Its edited reps/load/RPE live as local input state, seeded
// from the prescription pre-fill; "Complete" folds those values into a
// COMPLETE_SET event (the engine's only editing path).
function SetRow({ set, isCurrent, onComplete }: SetRowProps) {
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleComplete}
          className="self-start"
        >
          <Check className="h-3.5 w-3.5" />
          Complete set
        </Button>
      ) : null}
    </Card>
  );
}
