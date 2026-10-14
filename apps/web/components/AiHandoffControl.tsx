"use client";

import { useState } from "react";
import { Copy, Share2 } from "@/components/pulse/icons";

import { ActionSheetPanel } from "@/components/pulse/action-sheet";
import { Button } from "@/components/ui/button";
import { AI_HANDOFF_DISCLOSURE, type AiHandoff } from "@/lib/ai-handoff";
import {
  copyHandoff,
  handoffResultMessage,
  sendHandoff,
  type HandoffAction,
  type HandoffResult,
} from "@/lib/ai-handoff-send";

interface AiHandoffControlProps {
  // The hand-off, built from the saved record on the server by the `ai-handoff` view-model.
  handoff: AiHandoff;
}

// The "Send to an AI" control on a Logged Session's detail page (ADR-0132). It opens a bottom
// sheet with the full, read-only, selectable text, the permanent disclosure line, and Send / Copy.
// Thin by design: the text comes from `lib/ai-handoff.ts` and what a tap does from
// `lib/ai-handoff-send.ts`. Nothing is stored, logged or sent by the app itself.
export function AiHandoffControl({ handoff }: AiHandoffControlProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="w-full"
      >
        <Share2 className="h-4 w-4" aria-hidden />
        Send to an AI
      </Button>
      {open ? <AiHandoffSheet handoff={handoff} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

interface AiHandoffSheetProps extends AiHandoffControlProps {
  onClose: () => void;
}

// The open sheet. It mounts fresh on every open, so no earlier "Copied" outlives a close.
// Exported for the audit harness, which has to render the sheet open to measure it.
export function AiHandoffSheet({ handoff, onClose }: AiHandoffSheetProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HandoffResult | null>(null);
  const message = handoffResultMessage(result);

  // Run Send or Copy against this device and show what it did.
  async function handOff(action: HandoffAction): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      setResult(await action(handoff.text, navigator));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionSheetPanel title="Send to an AI" onClose={onClose}>
      <div className="flex flex-col gap-4 px-4 pb-2">
        <p className="font-sans text-[13px] leading-relaxed text-text-secondary">
          {AI_HANDOFF_DISCLOSURE}
        </p>
        <pre
          aria-label="Text to send"
          className="select-text whitespace-pre-wrap break-words rounded-sm border border-border bg-base/40 p-3 font-mono text-[12px] leading-relaxed text-text-primary"
        >
          {handoff.text}
        </pre>
        <p role="status" className="min-h-5 font-mono text-[12px] text-text-secondary">
          {message}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={busy}
            onClick={() => handOff(sendHandoff)}
            className="min-w-0 flex-1"
          >
            <Share2 className="h-4 w-4" aria-hidden />
            Send
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => handOff(copyHandoff)}
            className="min-w-0 flex-1"
          >
            <Copy className="h-4 w-4" aria-hidden />
            Copy
          </Button>
        </div>
      </div>
    </ActionSheetPanel>
  );
}
