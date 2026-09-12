// Maps a catalog Exercise's `required_equipment` to a Lucide symbol — the field-guide "at
// a glance, what do I need" marker (ADR-0072). Equipment labels are free-form in the
// Catalog, so we match on lowercased substrings and fall back to a neutral dot for an
// unmapped label; an empty / "bodyweight" list shows the bodyweight symbol. Uses the
// Lucide set the app already ships; no new dependency.

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

// Ordered substring → icon rules; first match wins, so specific labels (kettlebell)
// precede general ones (bar).
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

interface ResolvedEquipment {
  Icon: LucideIcon;
  label: string;
}

function meaningfulEquipment(equipment: readonly string[]): string[] {
  return equipment.filter(
    (item) => item.trim() && !BODYWEIGHT_LABELS.has(item.trim().toLowerCase()),
  );
}

// Resolve the FIRST meaningful piece of equipment to a symbol — the field-guide entry
// shows one primary symbol, the full list lives on Details. Bodyweight for an empty / none
// list; a neutral fallback for an unmapped label (still honest: "some equipment").
function resolvePrimaryEquipment(equipment: readonly string[]): ResolvedEquipment {
  const meaningful = meaningfulEquipment(equipment);
  if (meaningful.length === 0) {
    return { Icon: PersonStanding, label: "Bodyweight" };
  }
  const lower = meaningful[0].toLowerCase();
  for (const [needle, Icon, label] of EQUIPMENT_RULES) {
    if (lower.includes(needle)) return { Icon, label };
  }
  return { Icon: Circle, label: meaningful[0] };
}

interface EquipmentSymbolProps {
  equipment: readonly string[];
  className?: string;
  // When several pieces are required, show a "+N" so the entry doesn't imply just one.
  showOverflowCount?: boolean;
}

export function EquipmentSymbol({
  equipment,
  className,
  showOverflowCount = false,
}: EquipmentSymbolProps): React.JSX.Element {
  const { Icon, label } = resolvePrimaryEquipment(equipment);
  const overflow =
    showOverflowCount && meaningfulEquipment(equipment).length > 1
      ? meaningfulEquipment(equipment).length - 1
      : 0;

  return (
    <span
      className={"inline-flex items-center gap-1.5 text-text-muted " + (className ?? "")}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="label-mono text-[9px]">
        {label}
        {overflow > 0 ? ` +${overflow}` : ""}
      </span>
    </span>
  );
}
