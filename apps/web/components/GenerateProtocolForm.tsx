"use client";

import { Zap } from "lucide-react";

import { GenerationProgress } from "@/components/GenerationProgress";
import { EquipmentField } from "@/components/EquipmentField";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { useProtocolGeneration } from "@/lib/use-protocol-generation";
import { parseEquipment } from "@/lib/equipment-presets";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function GenerateProtocolForm() {
  const { phase, error, start } = useProtocolGeneration();
  const busy = phase === "submitting" || phase === "generating";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await start({
      training_type: String(form.get("training_type") ?? ""),
      objective: String(form.get("objective") ?? "").trim(),
      sessions_per_week: Number(form.get("sessions_per_week")),
      duration_minutes: Number(form.get("duration_minutes")),
      weeks: Number(form.get("weeks")),
      equipment: parseEquipment(String(form.get("equipment") ?? "")),
    });
  }

  if (busy) {
    return <GenerationProgress />;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label="Training type">
        <Select name="training_type" defaultValue="strength">
          {TRAINING_TYPES.map((trainingType) => (
            <option key={trainingType} value={trainingType}>
              {trainingType}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Objective">
        <Input
          name="objective"
          required
          placeholder="e.g. gain muscle mass"
          defaultValue="gain muscle mass"
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Sessions / wk">
          <Input
            name="sessions_per_week"
            type="number"
            min={1}
            max={14}
            defaultValue={3}
          />
        </Field>
        <Field label="Weeks">
          <Input name="weeks" type="number" min={1} max={52} defaultValue={4} />
        </Field>
        <Field label="Duration">
          <Input
            name="duration_minutes"
            type="number"
            min={1}
            max={360}
            defaultValue={45}
          />
        </Field>
      </div>

      <EquipmentField />

      <Button type="submit" className="w-full">
        <Zap className="h-4 w-4" />
        Generate protocol
      </Button>
    </form>
  );
}
