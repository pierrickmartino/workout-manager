"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Field } from "@/components/pulse/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CALISTHENICS_PRESET,
  applyEquipmentPreset,
} from "@/lib/equipment-presets";

// The shared equipment control for both generate forms: a free-text field plus a
// one-tap preset that populates it (#198). The input keeps `name="equipment"`, so
// its value still flows through the generation request exactly as typed equipment
// does — blank still means bodyweight. All merge logic lives in the tested pure
// module; this component is thin glue over it.
export function EquipmentField(): React.JSX.Element {
  const [equipment, setEquipment] = useState("");

  return (
    <Field label="Equipment" hint="Leave blank for bodyweight.">
      <Input
        name="equipment"
        placeholder="dumbbells, pull-up bar"
        value={equipment}
        onChange={(event) => setEquipment(event.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() =>
          setEquipment((current) =>
            applyEquipmentPreset(current, CALISTHENICS_PRESET.items),
          )
        }
      >
        <Plus className="h-3.5 w-3.5" />
        {CALISTHENICS_PRESET.label}
      </Button>
    </Field>
  );
}
