// PROTOTYPE — Field Guide exercise discovery. Throwaway; see README.md.
//
// Maps a catalog `required_equipment` label to a Lucide icon — the field-guide "at a
// glance, what do I need" symbol. Equipment labels are free-form in the catalog, so we
// match on lowercased substrings and fall back to a neutral dot for anything unmapped
// (and treat "bodyweight"/"none"/empty as no equipment). Uses the Lucide set the app
// already ships; no new dependency.

import {
  Dumbbell,
  Weight,
  Cable,
  Grip,
  Activity,
  Bike,
  Waves,
  PersonStanding,
  Circle,
  type LucideIcon,
} from "lucide-react";

// Ordered substring → icon rules. First match wins, so put the specific labels
// (kettlebell) before the general ones (bell → nothing here, but weight before bar).
const EQUIPMENT_RULES: ReadonlyArray<readonly [string, LucideIcon, string]> = [
  ["dumbbell", Dumbbell, "Dumbbell"],
  ["kettlebell", Weight, "Kettlebell"],
  ["barbell", Dumbbell, "Barbell"],
  ["ez bar", Dumbbell, "EZ bar"],
  ["bar", Dumbbell, "Bar"],
  ["cable", Cable, "Cable"],
  ["machine", Cable, "Machine"],
  ["band", Cable, "Resistance band"],
  ["pull-up", Grip, "Pull-up bar"],
  ["pull up", Grip, "Pull-up bar"],
  ["rig", Grip, "Rig"],
  ["rings", Grip, "Rings"],
  ["plate", Weight, "Weight plate"],
  ["weight", Weight, "Weight"],
  ["bike", Bike, "Bike"],
  ["rower", Activity, "Rower"],
  ["treadmill", Activity, "Treadmill"],
  ["erg", Activity, "Erg"],
  ["pool", Waves, "Pool"],
  ["bench", Weight, "Bench"],
  ["ball", Circle, "Ball"],
];

// Labels that mean "nothing needed" — surfaced as the bodyweight symbol, not a fallback dot.
const BODYWEIGHT_LABELS = new Set(["bodyweight", "body weight", "none", "no equipment"]);

export interface ResolvedEquipment {
  Icon: LucideIcon;
  label: string;
}

// Resolve the FIRST piece of equipment to a symbol — the field-guide entry shows one
// primary symbol, with the full list on Details. Returns bodyweight for an empty/none
// list, and a neutral fallback for an unmapped label (still honest: "some equipment").
export function resolvePrimaryEquipment(
  equipment: readonly string[],
): ResolvedEquipment {
  const meaningful = equipment.filter(
    (item) => item.trim() && !BODYWEIGHT_LABELS.has(item.trim().toLowerCase()),
  );

  if (meaningful.length === 0) {
    return { Icon: PersonStanding, label: "Bodyweight" };
  }

  const first = meaningful[0];
  const lower = first.toLowerCase();
  for (const [needle, Icon, label] of EQUIPMENT_RULES) {
    if (lower.includes(needle)) return { Icon, label };
  }
  return { Icon: Circle, label: first };
}

interface EquipmentSymbolProps {
  equipment: readonly string[];
  className?: string;
  // When several pieces are required, show a "+N" so the entry doesn't imply just one.
  showOverflowCount?: boolean;
}

// The compact symbol + short label used on a field-guide entry.
export function EquipmentSymbol({
  equipment,
  className,
  showOverflowCount = false,
}: EquipmentSymbolProps): React.JSX.Element {
  const { Icon, label } = resolvePrimaryEquipment(equipment);
  const meaningfulCount = equipment.filter(
    (item) => item.trim() && !BODYWEIGHT_LABELS.has(item.trim().toLowerCase()),
  ).length;
  const overflow = showOverflowCount && meaningfulCount > 1 ? meaningfulCount - 1 : 0;

  return (
    <span
      className={
        "inline-flex items-center gap-1.5 text-text-muted " + (className ?? "")
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="label-mono text-[9px]">
        {label}
        {overflow > 0 ? ` +${overflow}` : ""}
      </span>
    </span>
  );
}
