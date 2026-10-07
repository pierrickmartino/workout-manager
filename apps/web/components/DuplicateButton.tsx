"use client";

import { useActionState } from "react";
import { Copy } from "@/components/pulse/icons";

import {
  submitDuplicate,
  type DuplicateFormState,
} from "@/app/sessions/[id]/actions";
import {
  ActionSheetItemText,
  actionSheetItemClass,
} from "@/components/pulse/action-sheet-item";

interface DuplicateButtonProps {
  sessionId: number;
}

// Duplicate this Session into a new standalone plan (ADR-0043). Posts to the duplicate
// server action, which redirects to the new copy on success. Duplicate is unlimited, so
// there is no spent state; a failed attempt shows an inline error. A row of the Session detail's
// action sheet (ADR-0113); the redirect unmounts the sheet with the page.
export function DuplicateButton({ sessionId }: DuplicateButtonProps) {
  const [state, action, pending] = useActionState<DuplicateFormState, FormData>(
    submitDuplicate,
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col">
      <input type="hidden" name="session_id" value={sessionId} />
      <button type="submit" className={actionSheetItemClass()} disabled={pending}>
        <Copy className="h-4 w-4 shrink-0" aria-hidden />
        <ActionSheetItemText
          label={pending ? "Duplicating…" : "Duplicate session"}
          description="Fork a separate copy you can edit"
        />
      </button>
      {state.error ? (
        <span role="alert" className="px-4 pb-2 font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
