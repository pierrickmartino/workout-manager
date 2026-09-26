"use client";

import { useRef } from "react";

import { useModalFocus } from "@/lib/use-modal-focus";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  // The dialog heading and body. Kept caller-supplied so the one component serves any
  // confirm/discard flow.
  title: string;
  message: string;
  // The affirmative (destructive-by-default) and dismissive labels.
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// A small centered modal for a confirm/cancel decision, styled to the pulse system.
// Presentational only: the caller owns whether it is mounted and what each action
// does. Escape and a backdrop click both resolve to `onCancel` (the safe choice), and
// focus is moved to the dialog on open so keyboard users land inside it.
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef, true, onCancel, surfaceRef);

  return (
    <div
      ref={surfaceRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/70 p-6 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        tabIndex={-1}
        // Stop clicks inside the card from bubbling to the backdrop's cancel handler.
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[88dvh] overflow-y-auto overscroll-contain w-full max-w-sm flex-col gap-4 rounded-md border border-border bg-surface p-5 shadow-xl outline-none"
      >
        <h2
          id="confirm-dialog-title"
          className="font-display text-lg font-bold text-text-primary"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-message"
          className="font-mono text-[13px] leading-relaxed text-text-secondary"
        >
          {message}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            className="w-full sm:w-auto"
          >
            {confirmLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            className="w-full sm:w-auto"
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
