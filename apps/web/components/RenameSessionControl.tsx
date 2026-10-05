"use client";

import { useActionState, useState } from "react";
import { Pencil } from "@/components/pulse/icons";

import {
  submitRename,
  type RenameFormState,
} from "@/app/sessions/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACTION_SHEET_EDITOR,
  ActionSheetItemText,
  actionSheetItemClass,
} from "@/components/pulse/action-sheet";

// Matches the backend's Session Name length cap so the field never submits a value the
// server would reject at the boundary.
const MAX_SESSION_NAME_LENGTH = 120;

interface RenameSessionControlProps {
  sessionId: number;
  // The current display label — the user-given Session Name when set, else the derived
  // fallback — shown while the editor is closed.
  displayName: string;
  // Whether the user has named this Session (drives the button label and the Clear affordance).
  isUserNamed: boolean;
  // The value to seed the editor with: the current name, or empty to author a first one.
  editValue: string;
}

// The standalone Session's rename control (issue #394). Rendered only on standalone Sessions —
// the caller withholds it on a Protocol member, whose Week/Day `title` is a different concept.
// Closed, it shows the display label and a Rename/Name affordance; open, an inline editor sets or
// clears the Session Name through the rename action. Submitting an empty field clears the name, so
// the read falls back to the derived label. A thin renderer: normalization and the standalone-only
// and ownership guards live server-side. A row of the Session detail's action sheet (ADR-0113), whose
// editor opens in place of the row.
export function RenameSessionControl({
  sessionId,
  displayName,
  isUserNamed,
  editValue,
}: RenameSessionControlProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(editValue);
  const [state, action, pending] = useActionState<RenameFormState, FormData>(
    submitRename,
    { error: null },
  );

  if (!open) {
    return (
      <button
        type="button"
        aria-label={isUserNamed ? "Rename session" : "Name session"}
        className={actionSheetItemClass()}
        onClick={() => {
          setName(editValue);
          setOpen(true);
        }}
      >
        <Pencil className="h-4 w-4 shrink-0" aria-hidden />
        <ActionSheetItemText
          label={isUserNamed ? "Rename" : "Name session"}
          description="Give this session your own name"
        />
      </button>
    );
  }

  return (
    <form action={action} className={`${ACTION_SHEET_EDITOR} flex flex-col gap-2`}>
      <input type="hidden" name="session_id" value={sessionId} />
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Session name</span>
        {/* An authored Session Name is a label, not prose — "Push A", "W1D2", a gym's
            own shorthand — so the checker is off rather than underlining every one of
            them (ADR-0103).

            No `autoFocus` (ADR-0103): this editor opens inside the action sheet
            (ADR-0113; an `OverflowMenu` disclosure when that ADR was written), so on a
            phone the attribute raised the keyboard and scrolled the panel out from under
            the thumb that had just opened it. A reader who wants the field is one Tab —
            or one tap — away. */}
        <Input
          spellCheck={false}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={displayName}
          aria-label="Session name"
          maxLength={MAX_SESSION_NAME_LENGTH}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
        {/* Clearing the field and saving removes the name; this shortcut does the same in
            one tap when a name is already set, so the read falls back to the derived label.
            The submitted FormData is read from the live DOM, so empty the field's DOM value
            synchronously here — a `setName("")` alone wouldn't have re-rendered the controlled
            input before the native submit serializes it. */}
        {isUserNamed ? (
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={(event) => {
              const field = event.currentTarget.form?.elements.namedItem("name");
              if (field instanceof HTMLInputElement) field.value = "";
              setName("");
            }}
          >
            Clear name
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
      {state.error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
