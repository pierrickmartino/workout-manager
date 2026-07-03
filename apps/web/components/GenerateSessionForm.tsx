"use client";

import { useActionState } from "react";
import { Zap } from "lucide-react";

import { submitGenerate, type GenerateFormState } from "@/app/sessions/actions";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function GenerateSessionForm() {
  const [state, action, pending] = useActionState<GenerateFormState, FormData>(
    submitGenerate,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Field label="Training type">
        <Select name="training_type" defaultValue="strength">
          {TRAINING_TYPES.map((trainingType) => (
            <option key={trainingType} value={trainingType}>
              {trainingType}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Duration (minutes)">
        <Input
          name="duration_minutes"
          type="number"
          min={1}
          max={360}
          defaultValue={45}
        />
      </Field>

      <Field
        label="Equipment"
        hint="Leave blank for bodyweight."
      >
        <Input name="equipment" placeholder="dumbbells, pull-up bar" />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        <Zap className="h-4 w-4" />
        {pending ? "Generating…" : "Generate session"}
      </Button>
    </form>
  );
}
