"use client";

import { useActionState } from "react";
import { Zap } from "lucide-react";

import { submitGenerate, type GenerateFormState } from "@/app/sessions/actions";
import { EquipmentField } from "@/components/EquipmentField";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { useConnectivity } from "@/lib/use-connectivity";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { OfflineNotice } from "@/components/pulse/offline-notice";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface GenerateSessionFormProps {
  // The user's saved Default Equipment, pre-filled into the equipment field so it is
  // visible and editable before generating (ADR-0038).
  defaultEquipment?: readonly string[];
}

export function GenerateSessionForm({
  defaultEquipment = [],
}: GenerateSessionFormProps = {}) {
  const [state, action, pending] = useActionState<GenerateFormState, FormData>(
    submitGenerate,
    { error: null },
  );
  // AI generation is network-only: annotate and disable it while offline rather than let a
  // submit fail after the fact (issue #414).
  const online = useConnectivity();

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {!online ? (
        <OfflineNotice>
          Generating a session needs a connection — reconnect to generate.
        </OfflineNotice>
      ) : null}

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

      <EquipmentField initialEquipment={defaultEquipment} />

      <Button type="submit" disabled={pending || !online} className="w-full">
        <Zap className="h-4 w-4" />
        {pending ? "Generating…" : "Generate session"}
      </Button>
    </form>
  );
}
