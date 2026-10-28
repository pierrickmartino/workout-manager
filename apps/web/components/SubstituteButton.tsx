"use client";

import { useActionState, useState } from "react";
import { Repeat2 } from "@/components/pulse/icons";

import {
  submitSubstitute,
  type SubstituteFormState,
} from "@/app/sessions/[id]/actions";
import { useConnectivity } from "@/lib/use-connectivity";
import {
  EQUIPMENT_FIELD,
  EQUIPMENT_STATED_FIELD,
  prefillSubstituteEquipment,
  substituteEquipmentSummary,
  toggleSubstituteEquipment,
} from "@/lib/substitute-equipment";
import { Button } from "@/components/ui/button";
import { SubstituteEquipmentChips } from "@/components/SubstituteEquipmentChips";

interface SubstituteButtonProps {
  sessionId: number;
  position: number;
  // The Profile's canonical Default Equipment, pre-filling the picker (ADR-0143). Read once
  // per page and fixed for its life, so it seeds the picker state.
  defaultEquipment?: readonly string[];
}

// A per-prescription control to substitute the prescribed Exercise. "Substitute" first opens
// the Available Equipment picker — the kit the user has for this one swap, pre-filled with their
// Default Equipment, plus one-tap Bodyweight only (ADR-0143). The saved Profile is never
// changed. The picker posts to the substitution server action, and the revalidated Session page
// re-renders the swapped-in movement. Substitution is unlimited, so there is no spent state.
export function SubstituteButton({
  sessionId,
  position,
  defaultEquipment = [],
}: SubstituteButtonProps) {
  const [state, action, pending] = useActionState<SubstituteFormState, FormData>(
    submitSubstitute,
    { error: null },
  );
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() =>
    prefillSubstituteEquipment(defaultEquipment),
  );
  // Substitution is an AI (LLM) call: annotate and disable it while offline rather than
  // let a submit fail after the fact (issue #414).
  const online = useConnectivity();

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={false}
          disabled={!online}
          onClick={() => setOpen(true)}
        >
          <Repeat2 className="h-3.5 w-3.5" />
          Substitute
        </Button>
        {!online ? (
          <span className="font-mono text-[12px] text-text-muted">
            Offline — reconnect to substitute
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="flex min-w-0 flex-col gap-3">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="position" value={position} />
      <input type="hidden" name={EQUIPMENT_STATED_FIELD} value="1" />
      {selected.map((item) => (
        <input key={item} type="hidden" name={EQUIPMENT_FIELD} value={item} />
      ))}
      <SubstituteEquipmentChips
        label="Equipment you have for this swap"
        selected={selected}
        onBodyweightOnly={() => setSelected([])}
        onToggle={(item) => setSelected((current) => toggleSubstituteEquipment(current, item))}
      />
      <p className="font-mono text-[12px] text-text-muted">
        Using: {substituteEquipmentSummary(selected)}. Your profile stays as it is.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending || !online}>
          <Repeat2 className="h-3.5 w-3.5" />
          {pending ? "Finding a substitute…" : "Find a substitute"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
      {!online ? (
        <span className="font-mono text-[12px] text-text-muted">
          Offline — reconnect to substitute
        </span>
      ) : null}
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
