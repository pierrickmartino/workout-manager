"use client";

import { useActionState } from "react";

import { submitLog, type LogFormState } from "@/app/sessions/[id]/log/actions";
import type { ExercisePrescription } from "@/lib/sessions-types";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const RPE_VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

interface LogSessionFormProps {
  sessionId: number;
  prescriptions: ExercisePrescription[];
  today: string;
}

// Records a performance of a Session. One row per prescribed Exercise lets the
// user enter the real reps, load, and perceived difficulty (RPE 1–10) they did;
// rows left without reps are skipped. The session id is carried in a hidden field
// so the server action can target the right Session.
export function LogSessionForm({
  sessionId,
  prescriptions,
  today,
}: LogSessionFormProps) {
  const [state, action, pending] = useActionState<LogFormState, FormData>(
    submitLog,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="session_id" value={sessionId} />

      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Field label="Date performed">
        <Input
          name="performed_on"
          type="date"
          defaultValue={today}
          max={today}
          required
        />
      </Field>

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <SectionHeader>SETS PERFORMED</SectionHeader>

        {prescriptions.map((prescription) => (
          <div
            key={prescription.exercise_id}
            className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4"
          >
            <input
              type="hidden"
              name="exercise_id"
              value={prescription.exercise_id}
            />
            <span className="font-display text-[15px] font-semibold text-text-primary">
              {prescription.exercise_name}
            </span>
            <div className="grid grid-cols-3 gap-2.5">
              <label className="flex flex-col gap-1.5">
                <span className="label-mono text-[9px] text-text-muted">
                  Reps
                </span>
                <Input
                  name="reps"
                  type="number"
                  min={0}
                  aria-label={`Reps for ${prescription.exercise_name}`}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label-mono text-[9px] text-text-muted">
                  Load
                </span>
                <Input
                  name="load"
                  placeholder="70kg"
                  aria-label={`Load for ${prescription.exercise_name}`}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label-mono text-[9px] text-text-muted">
                  RPE
                </span>
                <Select
                  name="rpe"
                  defaultValue=""
                  aria-label={`RPE for ${prescription.exercise_name}`}
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
          </div>
        ))}
      </fieldset>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save log"}
      </Button>
    </form>
  );
}
