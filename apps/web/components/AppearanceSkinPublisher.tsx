"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { publishSkin } from "@/app/profile/skin-actions";
import { buildSkinControl } from "@/lib/appearance-view";
import type { Skin } from "@/lib/theme";
import { Alert } from "@/components/pulse/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AppearanceSkinPublisherProps {
  // The published Active Skin at load, read server-side; the app-wide baseline.
  activeSkin: Skin;
}

// Stamp the previewed Skin onto <html> so the whole app restyles for *this admin's
// session only* — no server write, nobody else affected. The Mode stays on its own
// `data-mode` attribute, so it keeps applying on top of the previewed Skin.
function stampSkin(skin: Skin): void {
  document.documentElement.setAttribute("data-skin", skin);
}

// The admin-only Appearance control (#332): review the fixed Skin catalog, preview
// a Skin privately (client-side, this session only), and explicitly Publish it as
// the global Active Skin (publishSkin → PUT /api/active-skin). The option list
// and preview/publish state come from the pure `buildSkinControl` mapper, so this
// component stays thin — it owns only the client-side stamping, the pending/error
// UI, and restoring the Active Skin when a preview is abandoned.
export function AppearanceSkinPublisher({
  activeSkin,
}: AppearanceSkinPublisherProps): React.JSX.Element {
  // `active` is the published truth (updated locally on a successful publish so the
  // control re-badges without waiting for a reload); `preview` is what this session
  // is currently showing. They start equal — no preview pending.
  const [active, setActive] = useState<Skin>(activeSkin);
  const [preview, setPreview] = useState<Skin>(activeSkin);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Always-current published Skin for the unmount cleanup, which must restore the
  // *latest* Active Skin (post-publish) without re-subscribing the effect.
  const activeRef = useRef<Skin>(activeSkin);
  activeRef.current = active;

  // If the admin navigates away mid-preview without publishing, restore the Active
  // Skin so the private preview never leaks past this screen (the root layout only
  // re-stamps `data-skin` on a full render, not a soft navigation).
  useEffect(() => {
    return () => stampSkin(activeRef.current);
  }, []);

  const control = buildSkinControl(active, preview);

  function choosePreview(skin: Skin): void {
    if (skin === preview) return;
    setError(null);
    setPreview(skin);
    stampSkin(skin);
  }

  function cancelPreview(): void {
    setError(null);
    setPreview(active);
    stampSkin(active);
  }

  function publish(): void {
    setError(null);
    startTransition(async () => {
      const result = await publishSkin(preview);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Publish succeeded: the previewed Skin is now the Active Skin. `preview`
      // already shows it, so promoting `active` clears the "previewing" state.
      setActive(preview);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="label-mono text-[11px] text-text-secondary">
          SKIN · ADMIN
        </span>
        <span className="label-mono text-[10px] text-text-muted">
          {control.isPreviewing ? "PREVIEWING" : "PUBLISHED"}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Active Skin"
        className="flex flex-col gap-2"
      >
        {control.options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            // The checked radio is whatever is applied to the session right now —
            // the preview while one is pending, otherwise the Active Skin. Since
            // `previewSkin` equals `activeSkin` when nothing is previewing, that is
            // exactly `previewSkin`.
            aria-checked={option.value === control.previewSkin}
            disabled={isPending}
            onClick={() => choosePreview(option.value)}
            className={cn(
              "flex items-center justify-between gap-3 rounded-sm border px-3.5 py-3 text-left transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-60",
              option.isPreviewing
                ? "border-violet bg-violet-dim"
                : option.isActive
                  ? "border-cyan bg-cyan-dim"
                  : "border-border bg-elevated/40 hover:bg-elevated/70",
            )}
          >
            <span className="flex flex-col gap-1">
              <span
                className={cn(
                  "font-sans text-[15px] font-medium",
                  option.isPreviewing
                    ? "text-violet"
                    : option.isActive
                      ? "text-cyan"
                      : "text-text-primary",
                )}
              >
                {option.label}
              </span>
              <span className="label-mono text-[10px] text-text-secondary">
                {option.caption}
              </span>
            </span>
            {option.isPreviewing ? (
              <span className="label-mono text-[10px] font-bold text-violet">
                PREVIEW
              </span>
            ) : option.isActive ? (
              <span className="label-mono text-[10px] font-bold text-cyan">
                ACTIVE
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {control.isPreviewing ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!control.canPublish || isPending}
            onClick={publish}
          >
            {isPending ? "Publishing…" : "Publish"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!control.canCancel || isPending}
            onClick={cancelPreview}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
