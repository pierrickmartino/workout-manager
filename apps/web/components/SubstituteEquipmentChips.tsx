"use client";

import { EQUIPMENT_LABEL, type Equipment } from "@/lib/equipment";
import {
  BODYWEIGHT_ONLY_LABEL,
  SUBSTITUTE_EQUIPMENT_OPTIONS,
  isBodyweightOnly,
} from "@/lib/substitute-equipment";
import { cn } from "@/lib/utils";
import { FieldGroup } from "@/components/pulse/field";

interface SubstituteEquipmentChipsProps {
  label: string;
  selected: readonly Equipment[];
  onToggle: (item: Equipment) => void;
  onBodyweightOnly: () => void;
}

const CHIP_CLASS =
  "rounded-sm border px-2 py-1 font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none";

function chipClass(selected: boolean): string {
  return cn(
    CHIP_CLASS,
    selected
      ? "border-cyan bg-cyan-dim text-cyan"
      : "border-border text-text-secondary hover:border-cyan hover:text-cyan",
  );
}

// The Available Equipment chips (ADR-0143): one-tap Bodyweight only, then each pickable piece of
// kit as a pressed/unpressed toggle. Shared by single Substitute and Equipment Substitution.
export function SubstituteEquipmentChips({
  label,
  selected,
  onToggle,
  onBodyweightOnly,
}: SubstituteEquipmentChipsProps) {
  return (
    <FieldGroup label={label}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={isBodyweightOnly(selected)}
          className={chipClass(isBodyweightOnly(selected))}
          onClick={onBodyweightOnly}
        >
          {BODYWEIGHT_ONLY_LABEL}
        </button>
        {SUBSTITUTE_EQUIPMENT_OPTIONS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={selected.includes(item)}
            className={chipClass(selected.includes(item))}
            onClick={() => onToggle(item)}
          >
            {EQUIPMENT_LABEL[item]}
          </button>
        ))}
      </div>
    </FieldGroup>
  );
}
