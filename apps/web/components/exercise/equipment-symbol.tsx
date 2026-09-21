// Maps a movement's canonical Equipment tokens (ADR-0077) to a Lucide symbol — the field-guide
// "at a glance, what do I need" marker (ADR-0072). The backend rolls the free-text equipment up
// into a small curated vocabulary, so this matches on the canonical token and reads its human
// label from `lib/equipment`; an empty / "bodyweight" list shows the bodyweight symbol, and the
// honest "other" bucket falls to a neutral dot. Uses the Lucide set the app already ships.

import {
  Dumbbell,
  Weight,
  Cable,
  Grip,
  Activity,
  PersonStanding,
  Circle,
  type LucideIcon,
} from "lucide-react";

import { equipmentLabel } from "@/lib/equipment";

// Ordered canonical-token → icon rules; first match wins, so a specific token (kettlebell)
// precedes a broader one. Labels are owned by `lib/equipment`, so these carry the icon only.
const EQUIPMENT_ICONS: ReadonlyArray<readonly [string, LucideIcon]> = [
  ["kettlebell", Weight],
  ["dumbbell", Dumbbell],
  ["barbell", Dumbbell],
  ["cable", Cable],
  ["machine", Cable],
  ["resistance band", Cable],
  ["pull-up bar", Grip],
  ["rings", Grip],
  ["parallettes", Grip],
  ["cardio machine", Activity],
  ["medicine ball", Circle],
  ["bench", Weight],
  ["rack", Weight],
];

// The canonical token that means "nothing needed" — the bodyweight symbol, not a fallback dot.
const BODYWEIGHT_LABELS = new Set(["bodyweight"]);

interface ResolvedEquipment {
  Icon: LucideIcon;
  label: string;
}

function meaningfulEquipment(equipment: readonly string[]): string[] {
  return equipment.filter(
    (item) => item.trim() && !BODYWEIGHT_LABELS.has(item.trim().toLowerCase()),
  );
}

// Resolve the FIRST meaningful piece of equipment to a symbol — the field-guide entry shows one
// primary symbol, the full list lives on Details. Bodyweight for an empty / bodyweight-only
// list; a neutral dot for a token with no dedicated icon (still honest: "some equipment"). The
// label is always the canonical Title-Case form, so a chip and its symbol never disagree.
function resolvePrimaryEquipment(equipment: readonly string[]): ResolvedEquipment {
  const meaningful = meaningfulEquipment(equipment);
  if (meaningful.length === 0) {
    return { Icon: PersonStanding, label: "Bodyweight" };
  }
  const token = meaningful[0];
  const lower = token.toLowerCase();
  const Icon =
    EQUIPMENT_ICONS.find(([needle]) => lower.includes(needle))?.[1] ?? Circle;
  return { Icon, label: equipmentLabel(token) };
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
