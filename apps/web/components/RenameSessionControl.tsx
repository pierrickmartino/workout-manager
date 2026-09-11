"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";

import {
  submitRename,
  type RenameFormState,
} from "@/app/sessions/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
// and ownership guards live server-side.
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={isUserNamed ? "Rename session" : "Name session"}
        onClick={() => {
          setName(editValue);
          setOpen(true);
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
        {isUserNamed ? "Rename" : "Name session"}
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="session_id" value={sessionId} />
      <label className="flex flex-col gap-1.5">
        <span className="label-mono text-[9px] text-text-muted">Session name</span>
        <Input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={displayName}
          aria-label="Session name"
          maxLength={MAX_SESSION_NAME_LENGTH}
          autoFocus
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
