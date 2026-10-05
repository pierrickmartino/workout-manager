"use client";

import { createContext, use, useCallback, useId, useMemo, useRef, useState } from "react";
import { MoreHorizontal, X } from "@/components/pulse/icons";

import { useModalFocus } from "@/lib/use-modal-focus";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// What an action inside a sheet can do to the sheet: close it once it is finished. Most actions
// never need it — one that navigates or deletes its own row unmounts the sheet with it — but a
// one-tap action that leaves the page as it was (Favorite) and one whose card survives it with
// different content (Remove, on a position-keyed card) must say "done" themselves.
interface ActionSheetValue {
  actions: { close: () => void };
}

const ActionSheetContext = createContext<ActionSheetValue | null>(null);

// The sheet an action sits in, or `null` outside one, so a control can render on its own (a test,
// a future surface) without a provider and simply has nothing to close.
export function useActionSheet(): ActionSheetValue | null {
  return use(ActionSheetContext);
}

interface ActionSheetProps {
  // The trigger's accessible name. The trigger is icon-only, so this is its whole name: make it
  // say whose actions these are when several triggers share a screen ("Actions for Push A").
  label: string;
  // The sheet's visible heading, which also names the dialog.
  title: string;
  children: React.ReactNode;
}

// A page's rare and destructive actions, one tap behind a ⋯ icon (ADR-0071), raised in a bottom
// sheet (ADR-0113). It replaced a full-width `<details>` disclosure whose trigger and panel were
// two bordered boxes at Card weight, often around a single item. The trigger now costs no line of
// its own — it sits beside the primary verb — and the sheet can grow and scroll, so the inline
// editors its actions open (Rename, Share, a two-step Delete) never outgrow their container.
//
// The actions render only while the sheet is open, so each one starts from its closed state every
// time the sheet is raised. Callers render it only when it would hold at least one action.
export function ActionSheet({ label, title, children }: ActionSheetProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ actions: { close } }), [close]);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={buttonVariants({ variant: "ghost", size: "icon", className: "shrink-0" })}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>
      {open ? (
        <ActionSheetContext value={value}>
          <ActionSheetPanel title={title} onClose={close}>
            {children}
          </ActionSheetPanel>
        </ActionSheetContext>
      ) : null}
    </>
  );
}

// Stops a gesture that starts inside the sheet at the sheet. The sheet renders where its trigger
// is, so in the DOM it sits inside whatever wraps that trigger — and a My Sessions row wraps its
// whole card in a press-and-hold Favorite shortcut, which a held finger on any action would arm.
function stopPropagation(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

interface ActionSheetPanelProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

// The open sheet itself, presentational like `ConfirmDialog`: the caller owns whether it is
// mounted. Exported for the audit harness, which has to render a sheet open to measure it.
// Escape, the close button and a tap on the backdrop all dismiss it; focus moves in on open and
// back to the opener on close, and the page beneath is `inert` meanwhile (`useModalFocus`).
export function ActionSheetPanel({
  title,
  onClose,
  children,
}: ActionSheetPanelProps): React.JSX.Element {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(dialogRef, true, onClose, surfaceRef);

  return (
    <div
      ref={surfaceRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-base/70 backdrop-blur-sm"
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onPointerDown={stopPropagation}
      onPointerMove={stopPropagation}
      onPointerUp={stopPropagation}
      onPointerCancel={stopPropagation}
      onPointerLeave={stopPropagation}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[86dvh] w-full max-w-shell flex-col overflow-y-auto overscroll-contain rounded-t-md border border-b-0 border-border-lite bg-surface pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-xl outline-none"
      >
        <div className="flex items-center justify-between gap-3 py-2 pr-2 pl-4">
          {/* An authored Session or Exercise name can be the title, so it wraps and is never
              truncated (ADR-0085). */}
          <h2
            id={titleId}
            className="label-mono min-w-0 break-words text-[11px] text-text-muted"
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={buttonVariants({ variant: "ghost", size: "icon", className: "shrink-0" })}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col">{children}</div>
      </div>
    </div>
  );
}

// The rule between the safe actions and the destructive one, which always comes last.
export function ActionSheetSeparator(): React.JSX.Element {
  return <hr className="my-1 border-border" />;
}

// One row of the sheet: full-bleed, at least 52px tall, icon then label then an optional
// description. Every action renders its closed state with this, whatever element it is — a
// `button`, a submit inside the action's own form, or a `Link` — so they read as one list.
//
// A disabled row mutes its label and icon rather than fading the whole row: its description is
// the reason it is disabled, and a reason at half opacity is the one sentence the reader needs.
export function actionSheetItemClass(tone: "default" | "danger" = "default"): string {
  return cn(
    "flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan disabled:cursor-not-allowed disabled:text-text-muted disabled:hover:bg-transparent motion-reduce:transition-none",
    tone === "danger"
      ? "text-magenta hover:bg-magenta-dim"
      : "text-text-primary hover:bg-elevated",
  );
}

// The label and the description under it. The description is where a disabled action says why —
// a `title` tooltip never appears under a finger.
export function ActionSheetItemText({
  label,
  description,
}: {
  label: string;
  description?: string | null;
}): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-col">
      <span>{label}</span>
      {description ? (
        <span className="text-[12px] font-normal text-text-muted">{description}</span>
      ) : null}
    </span>
  );
}

// An inline editor or confirm an action opens in place of its row (a name field, a share link, a
// two-step Delete): the rows' inset, since the sheet's list itself is full-bleed. The editor keeps
// its own layout and adds this to it.
export const ACTION_SHEET_EDITOR = "px-4 py-3";
