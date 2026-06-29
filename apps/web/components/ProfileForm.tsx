"use client";

import { useActionState } from "react";

import { submitProfile, type ProfileFormState } from "@/app/profile/actions";
import {
  SENSITIVE_CONSTRAINT_TYPES,
  TRAINING_TYPES,
  type Profile,
} from "@/lib/profile";

interface ProfileFormProps {
  // Pre-fill when editing an existing profile; omit during first onboarding.
  profile?: Profile;
  submitLabel: string;
}

const LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

const fieldStyle: React.CSSProperties = { display: "block", marginBottom: "1rem" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600 };

export function ProfileForm({ profile, submitLabel }: ProfileFormProps) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    submitProfile,
    { error: null },
  );

  return (
    <form action={action}>
      {state.error ? (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {state.error}
        </p>
      ) : null}

      <label style={fieldStyle}>
        <span style={labelStyle}>Display name</span>
        <input name="display_name" defaultValue={profile?.display_name ?? ""} />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Gender</span>
        <input name="gender" defaultValue={profile?.gender ?? ""} />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Age</span>
        <input
          name="age"
          type="number"
          min={0}
          max={150}
          defaultValue={profile?.age ?? ""}
        />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Height (cm)</span>
        <input
          name="height_cm"
          type="number"
          step="0.1"
          defaultValue={profile?.height_cm ?? ""}
        />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Weight (kg)</span>
        <input
          name="weight_kg"
          type="number"
          step="0.1"
          defaultValue={profile?.weight_kg ?? ""}
        />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Training habits</span>
        <textarea
          name="training_habits"
          rows={2}
          defaultValue={profile?.training_habits ?? ""}
        />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Default equipment</span>
        <input
          name="default_equipment"
          placeholder="dumbbells, pull-up bar"
          defaultValue={(profile?.default_equipment ?? []).join(", ")}
        />
      </label>

      <fieldset style={fieldStyle}>
        <legend style={labelStyle}>Fitness level per training type (1–10)</legend>
        {TRAINING_TYPES.map((trainingType) => (
          <label
            key={trainingType}
            style={{ display: "inline-block", marginRight: "1rem" }}
          >
            <span style={{ textTransform: "capitalize" }}>{trainingType}</span>{" "}
            <select
              name={`level_${trainingType}`}
              defaultValue={profile?.fitness_levels?.[trainingType] ?? ""}
            >
              <option value="">—</option>
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>

      <label style={fieldStyle}>
        <span style={labelStyle}>Preferences / limitations (non-medical)</span>
        <textarea
          name="preferences"
          rows={2}
          placeholder="no running, no jumping in the apartment"
          defaultValue={(profile?.preferences ?? []).join(", ")}
        />
      </label>

      <fieldset style={fieldStyle}>
        <legend style={labelStyle}>
          Sensitive constraints (trigger extra caution)
        </legend>
        {SENSITIVE_CONSTRAINT_TYPES.map((constraint) => (
          <label key={constraint.value} style={{ display: "block" }}>
            <input
              type="checkbox"
              name="sensitive_constraints"
              value={constraint.value}
              defaultChecked={profile?.sensitive_constraints?.includes(
                constraint.value,
              )}
            />{" "}
            {constraint.label}
          </label>
        ))}
      </fieldset>

      <label style={fieldStyle}>
        <span style={labelStyle}>Recent workout (optional)</span>
        <textarea
          name="recent_workout"
          rows={2}
          defaultValue={profile?.recent_workout ?? ""}
        />
      </label>

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
