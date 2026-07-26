"use client";

import { useActionState } from "react";

import { submitAdhocLog, type AdhocLogFormState } from "@/app/logs/new/actions";
import { LOAD_KIND_OPTIONS } from "@/lib/load";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface AdhocLogFormProps {
  today: string;
}

// Logs an ad-hoc movement outside any Protocol (ADR-0031): name the movement (resolved
// to a catalog Exercise by search-and-create, ADR-0033), pick a training type, and
// record a repetition set. No Session, no Completion Outcome — a plan-less record.
export function AdhocLogForm({ today }: AdhocLogFormProps) {
  const [state, action, pending] = useActionState<AdhocLogFormState, FormData>(
    submitAdhocLog,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col gap-6">
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

      <Field label="Training type">
        <Select name="training_type" defaultValue="cardio">
          {TRAINING_TYPES.map((trainingType) => (
            <option key={trainingType} value={trainingType}>
              {trainingType}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <SectionHeader>MOVEMENT PERFORMED</SectionHeader>

        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <label className="flex flex-col gap-1.5">
            <span className="label-mono text-[9px] text-text-muted">Movement</span>
            <Input
              name="movement_name"
              placeholder="Running"
              aria-label="Movement name"
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1.5">
              <span className="label-mono text-[9px] text-text-muted">Reps</span>
              <Input name="reps" type="number" min={0} aria-label="Reps" required />
            </label>
          </div>
          {/* Load is a typed value (ADR-0010): pick its kind, then give the value that
              kind carries. Left blank, the set records no load. */}
          <div className="grid grid-cols-[7rem_1fr] gap-2.5">
            <label className="flex flex-col gap-1.5">
              <span className="label-mono text-[9px] text-text-muted">Load kind</span>
              <Select name="load_kind" defaultValue="bodyweight" aria-label="Load kind">
                {LOAD_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label-mono text-[9px] text-text-muted">Load</span>
              <Input name="load_value" placeholder="0" aria-label="Load" />
            </label>
          </div>
        </div>
      </fieldset>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Log it"}
      </Button>
    </form>
  );
}
