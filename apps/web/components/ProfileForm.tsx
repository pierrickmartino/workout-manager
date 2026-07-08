"use client";

import { useActionState } from "react";

import { submitProfile, type ProfileFormState } from "@/app/profile/actions";
import {
  GENDER_OPTIONS,
  SENSITIVE_CONSTRAINT_TYPES,
  TRAINING_TYPES,
  type Profile,
} from "@/lib/profile-types";
import { Field } from "@/components/pulse/field";
import { Alert } from "@/components/pulse/alert";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ProfileFormProps {
  // Pre-fill when editing an existing profile; omit during first onboarding.
  profile?: Profile;
  submitLabel: string;
}

const LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

// Shared fieldset-legend styling in the pulse mono micro-label grammar.
const legendClass = "label-mono text-[11px] font-medium text-text-secondary";

export function ProfileForm({ profile, submitLabel }: ProfileFormProps) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    submitProfile,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Field label="Display name">
        <Input name="display_name" defaultValue={profile?.display_name ?? ""} />
      </Field>

      <Field label="Gender">
        <Select name="gender" defaultValue={profile?.gender ?? ""}>
          <option value="">—</option>
          {GENDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Age">
          <Input
            name="age"
            type="number"
            min={0}
            max={150}
            defaultValue={profile?.age ?? ""}
          />
        </Field>
        <Field label="Height (cm)">
          <Input
            name="height_cm"
            type="number"
            step="0.1"
            defaultValue={profile?.height_cm ?? ""}
          />
        </Field>
        <Field label="Weight (kg)">
          <Input
            name="weight_kg"
            type="number"
            step="0.1"
            defaultValue={profile?.weight_kg ?? ""}
          />
        </Field>
      </div>

      <Field label="Training habits">
        <Textarea
          name="training_habits"
          rows={2}
          defaultValue={profile?.training_habits ?? ""}
        />
      </Field>

      <Field label="Default equipment">
        <Input
          name="default_equipment"
          placeholder="dumbbells, pull-up bar"
          defaultValue={(profile?.default_equipment ?? []).join(", ")}
        />
      </Field>

      <Field label="Default rest timer (seconds)">
        <Input
          name="default_rest_seconds"
          type="number"
          min={1}
          placeholder="Leave blank to use each exercise's prescribed rest"
          defaultValue={profile?.default_rest_seconds ?? ""}
        />
      </Field>

      <fieldset className="flex flex-col gap-3 border-0 p-0">
        <legend className={legendClass}>
          Fitness level per training type (1–10)
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {TRAINING_TYPES.map((trainingType) => (
            <label key={trainingType} className="flex flex-col gap-1.5">
              <span className="font-sans text-[13px] capitalize text-text-secondary">
                {trainingType}
              </span>
              <Select
                name={`level_${trainingType}`}
                defaultValue={profile?.fitness_levels?.[trainingType] ?? ""}
              >
                <option value="">—</option>
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </Select>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Preferences / limitations (non-medical)">
        <Textarea
          name="preferences"
          rows={2}
          placeholder="no running, no jumping in the apartment"
          defaultValue={(profile?.preferences ?? []).join(", ")}
        />
      </Field>

      <fieldset className="flex flex-col gap-2.5 border-0 p-0">
        <legend className={legendClass}>
          Sensitive constraints (trigger extra caution)
        </legend>
        <div className="flex flex-col gap-2">
          {SENSITIVE_CONSTRAINT_TYPES.map((constraint) => (
            <label
              key={constraint.value}
              className="flex items-center gap-3 rounded-sm border border-border bg-surface px-3.5 py-3 text-sm text-text-primary transition-colors hover:border-border-lite has-[:checked]:border-magenta/50 has-[:checked]:bg-magenta-dim"
            >
              <input
                type="checkbox"
                name="sensitive_constraints"
                value={constraint.value}
                defaultChecked={profile?.sensitive_constraints?.includes(
                  constraint.value,
                )}
                className="h-4 w-4 accent-magenta"
              />
              {constraint.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Recent workout (optional)">
        <Textarea
          name="recent_workout"
          rows={2}
          defaultValue={profile?.recent_workout ?? ""}
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
