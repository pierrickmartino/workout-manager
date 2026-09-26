"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { unstable_rethrow } from "next/navigation";

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
  // Where the save action returns the user. Editing round-trips to the screen the
  // form was opened from (the Profile), while first onboarding is a one-way step
  // into the app — so this defaults to the Dashboard. Sanitized server-side.
  returnTo?: string;
}

const LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

// Shared fieldset-legend styling in the pulse mono micro-label grammar.
const legendClass = "label-mono text-[11px] font-medium text-text-secondary";

export function ProfileForm({
  profile,
  submitLabel,
  returnTo,
}: ProfileFormProps) {
  const submittedValues = useRef<FormData | null>(null);
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    async (previous, form) => {
      submittedValues.current = form;
      try {
        return await submitProfile(previous, form);
      } catch (error) {
        unstable_rethrow(error);
        return { error: "Could not save your profile. Please try again." };
      }
    },
    { error: null },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();
  const summaryId = `${formId}-errors`;
  useEffect(() => {
    if (pending || !state.error) return;
    const form = formRef.current;
    // React resets uncontrolled action forms after resolution, including error
    // results. Restore the attempted values so users can correct their input.
    if (submittedValues.current) {
      form?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]), select, textarea',
      ).forEach((control) => {
        const values = submittedValues.current!.getAll(control.name);
        if (control instanceof HTMLInputElement && control.type === "checkbox") {
          control.checked = values.includes(control.value);
        } else {
          control.value = typeof values[0] === "string" ? values[0] : "";
        }
      });
    }
    const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?? form?.querySelector<HTMLElement>('[data-error-summary]');
    target?.focus();
  }, [state, pending]);

  return (
    <form ref={formRef} action={action} noValidate className="flex flex-col gap-5">
      {returnTo ? (
        <input type="hidden" name="returnTo" value={returnTo} />
      ) : null}
      {state.error ? (
        <Alert id={summaryId} tone="error" tabIndex={-1} data-error-summary>
          {state.error}
        </Alert>
      ) : null}

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
        <Field label="Age" error={state.fieldErrors?.age}>
          <Input
            name="age"
            type="number"
            min={0}
            max={150}
            defaultValue={profile?.age ?? ""}
          />
        </Field>
        <Field label="Height (cm)" error={state.fieldErrors?.height_cm}>
          <Input
            name="height_cm"
            type="number"
            step="0.1"
            defaultValue={profile?.height_cm ?? ""}
          />
        </Field>
        <Field label="Weight (kg)" error={state.fieldErrors?.weight_kg}>
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

      <Field
        label="Default rest timer (seconds)"
        error={state.fieldErrors?.default_rest_seconds}
        hint="Leave blank to use each Exercise's prescribed rest."
      >
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
            <Field
              key={trainingType}
              label={<span className="capitalize">{trainingType}</span>}
              error={state.fieldErrors?.[`level_${trainingType}`]}
            >
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
            </Field>
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
              htmlFor={`${formId}-constraint-${constraint.value}`}
              key={constraint.value}
              className="flex items-center gap-3 rounded-sm border border-border bg-surface px-3.5 py-3 text-sm text-text-primary transition-colors hover:border-border-lite has-[:checked]:border-magenta/50 has-[:checked]:bg-magenta-dim"
            >
              <input
                id={`${formId}-constraint-${constraint.value}`}
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
