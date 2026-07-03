"use client";

import { useActionState } from "react";

import { submitMetric, type RecordMetricState } from "@/app/metrics/actions";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface RecordMetricFormProps {
  today: string;
  // The metric currently being viewed, pre-filled so a reading lands in the same
  // series the user is looking at.
  defaultMetric: string;
}

// Records one dated metric reading (weight, body-fat, …). The metric name, a
// numeric value, and a date are required; the unit is free-form and optional.
export function RecordMetricForm({ today, defaultMetric }: RecordMetricFormProps) {
  const [state, action, pending] = useActionState<RecordMetricState, FormData>(
    submitMetric,
    { error: null, saved: false },
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Reading saved.</Alert> : null}

      <Field label="Metric">
        <Input
          name="metric"
          defaultValue={defaultMetric}
          placeholder="e.g. weight"
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Value">
          <Input name="value" type="number" step="any" required />
        </Field>
        <Field label="Unit (optional)">
          <Input name="unit" placeholder="e.g. kg" />
        </Field>
      </div>

      <Field label="Date recorded">
        <Input
          name="recorded_on"
          type="date"
          defaultValue={today}
          max={today}
          required
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Record reading"}
      </Button>
    </form>
  );
}
