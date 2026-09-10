import { GENDER_OPTIONS, type Profile } from "@/lib/profile";
import { DataList } from "@/components/pulse/data-list";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// A read-only snapshot of the generation-input Fitness Profile — gender, age, height,
// weight, training habits, Default Equipment, per-training-type Fitness Levels, Preferences
// / Limitations, and Sensitive Constraints. Demoted from Home to Profile (docs/redesign-ia.md,
// ADR-0071): it duplicated the Profile tab, so Home no longer carries it. The editable form
// remains behind "Edit fitness profile".

function formatGender(gender: string | null): string {
  if (gender === null) return "—";
  return (
    GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? gender
  );
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

function formatLevels(levels: Record<string, number>): React.ReactNode {
  const entries = Object.entries(levels);
  if (entries.length === 0) return "—";
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      {entries.map(([type, level]) => (
        <Badge key={type} variant="outline">
          {type} {level}/10
        </Badge>
      ))}
    </span>
  );
}

export function FitnessProfileSummary({
  profile,
}: {
  profile: Profile;
}): React.JSX.Element {
  return (
    <Card className="p-5">
      <DataList
        rows={[
          { label: "Display name", value: profile.display_name ?? "—" },
          { label: "Gender", value: formatGender(profile.gender) },
          { label: "Age", value: profile.age ?? "—" },
          {
            label: "Height",
            value: profile.height_cm !== null ? `${profile.height_cm} cm` : "—",
          },
          {
            label: "Weight",
            value: profile.weight_kg !== null ? `${profile.weight_kg} kg` : "—",
          },
          { label: "Training habits", value: profile.training_habits ?? "—" },
          {
            label: "Default equipment",
            value: formatList(profile.default_equipment),
          },
          {
            label: "Fitness levels",
            value: formatLevels(profile.fitness_levels),
          },
          {
            label: "Preferences / limitations",
            value: formatList(profile.preferences),
          },
          {
            label: "Sensitive constraints",
            value: formatList(profile.sensitive_constraints),
          },
          {
            label: "Requires extra caution",
            value: profile.is_sensitive ? "Yes" : "No",
          },
        ]}
      />
    </Card>
  );
}
