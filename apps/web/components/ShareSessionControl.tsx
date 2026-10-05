"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Share2 } from "@/components/pulse/icons";

import { submitRevokeShare, submitShare } from "@/app/sessions/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACTION_SHEET_EDITOR,
  ActionSheetItemText,
  actionSheetItemClass,
} from "@/components/pulse/action-sheet";

interface ShareSessionControlProps {
  sessionId: number;
}

// The standalone Session's Share control (Share, ADR-0057, issue #398). Rendered only on
// standalone Sessions — the caller withholds it on a Protocol member (a Share Link is
// standalone-only, like Rename/Favorite), mirroring how Duplicate is withheld there.
//
// Closed, it offers a "Share" affordance; producing a link reveals the shareable URL with Copy and
// Revoke. Producing is idempotent server-side (re-sharing returns the same live link), and Revoke
// is the sharer's off-switch — it stops future Redeems but never reaches copies already taken. A
// thin renderer: the token, the URL, and the ownership/standalone guards are all owned server-side.
// A row of the Session detail's action sheet (ADR-0113); the link opens in place of the row, and
// the sheet stays up so it can be copied.
export function ShareSessionControl({ sessionId }: ShareSessionControlProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function produce() {
    startTransition(async () => {
      setError(null);
      const result = await submitShare(sessionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(result.url);
      setCopied(false);
    });
  }

  function revoke() {
    startTransition(async () => {
      setError(null);
      const result = await submitRevokeShare(sessionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl(null);
      setCopied(false);
    });
  }

  async function copy() {
    if (url === null) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the URL stays visible for a manual copy.
      setCopied(false);
    }
  }

  if (url === null) {
    return (
      <div className="flex flex-col">
        <button type="button" className={actionSheetItemClass()} onClick={produce} disabled={pending}>
          <Share2 className="h-4 w-4 shrink-0" aria-hidden />
          <ActionSheetItemText
            label={pending ? "Creating link…" : "Share"}
            description="Publish a link anyone can save a copy from"
          />
        </button>
        {error ? (
          <span role="alert" className="px-4 pb-2 font-mono text-[12px] text-magenta">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`${ACTION_SHEET_EDITOR} flex flex-col gap-2`}>
      <span className="label-mono text-[9px] text-text-muted">
        Anyone with this link can save a copy
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={url}
          readOnly
          aria-label="Share link"
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-[220px] flex-1"
        />
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={revoke}
          disabled={pending}
        >
          {pending ? "Revoking…" : "Revoke"}
        </Button>
      </div>
      {error ? (
        <span role="alert" className="font-mono text-[12px] text-magenta">
          {error}
        </span>
      ) : null}
    </div>
  );
}
