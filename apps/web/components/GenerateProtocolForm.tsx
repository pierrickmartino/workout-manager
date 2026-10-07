"use client";

import { useState } from "react";
import { Zap } from "@/components/pulse/icons";

import { GenerationProgress } from "@/components/GenerationProgress";
import { EquipmentField } from "@/components/EquipmentField";
import { ConfirmDialog } from "@/components/pulse/confirm-dialog";
import type { GenerateProtocolInput } from "@/lib/protocols-types";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { useProtocolGeneration } from "@/lib/use-protocol-generation";
import { useConnectivity } from "@/lib/use-connectivity";
import { parseEquipment } from "@/lib/equipment-presets";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { OfflineNotice } from "@/components/pulse/offline-notice";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface GenerateProtocolFormProps {
  // The one-way-door confirmation to show before generating, or `null` when
  // superseding is silent (no in-progress Current Protocol to set aside, ADR-0037).
  // Computed server-side from the Home read so the client stays dumb.
  supersedeWarning?: string | null;
  // The user's saved Default Equipment, pre-filled into the equipment field so it is
  // visible and editable before generating (ADR-0038).
  defaultEquipment?: readonly string[];
}

export function GenerateProtocolForm({
  supersedeWarning = null,
  defaultEquipment = [],
}: GenerateProtocolFormProps = {}) {
  const { phase, error, start } = useProtocolGeneration();
  const busy = phase === "submitting" || phase === "generating";
  // AI generation is network-only: annotate and disable it while offline rather than let a
  // submit fail after the fact (issue #414).
  const online = useConnectivity();
  // The submitted values, held while the one-way-door question is on screen. The form is
  // uncontrolled, so what the user filled in has to be read at submit time and kept — the
  // alternative, re-reading the form on confirm, would depend on it still being mounted.
  const [pendingGeneration, setPendingGeneration] =
    useState<GenerateProtocolInput | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: GenerateProtocolInput = {
      training_type: String(form.get("training_type") ?? ""),
      objective: String(form.get("objective") ?? "").trim(),
      sessions_per_week: Number(form.get("sessions_per_week")),
      duration_minutes: Number(form.get("duration_minutes")),
      weeks: Number(form.get("weeks")),
      equipment: parseEquipment(String(form.get("equipment") ?? "")),
    };
    // Guard the supersede at the moment of generation: generating adopts a new
    // Protocol that becomes Current and sets the old one aside (ADR-0037). Warn only
    // when there is settled progress to lose; silent otherwise. The question is asked in
    // the app's own dialog rather than `window.confirm` (#8): a browser that has been told
    // to suppress further dialogs would otherwise answer this one-way door for the user.
    if (supersedeWarning !== null) {
      setPendingGeneration(input);
      return;
    }
    await start(input);
  }

  if (busy) {
    return <GenerationProgress />;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {error ? <Alert announce tone="error">{error}</Alert> : null}
      {!online ? (
        <OfflineNotice>
          Generating a protocol needs a connection — reconnect to generate.
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

      <Field label="Objective">
        <Input
          name="objective"
          required
          placeholder="e.g. gain muscle mass…"
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

      <EquipmentField initialEquipment={defaultEquipment} />

      <Button type="submit" disabled={!online} className="w-full">
        <Zap className="h-4 w-4" />
        Generate protocol
      </Button>

      {pendingGeneration !== null && supersedeWarning !== null ? (
        <ConfirmDialog
          title="Set aside your current protocol?"
          message={supersedeWarning}
          confirmLabel="Generate anyway"
          cancelLabel="Keep current"
          onCancel={() => setPendingGeneration(null)}
          onConfirm={() => {
            const input = pendingGeneration;
            setPendingGeneration(null);
            void start(input);
          }}
        />
      ) : null}
    </form>
  );
}
