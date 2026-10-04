"use client";

import * as React from "react";

import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";

// PROTOTYPE — THROWAWAY. The floating variant bar every UI prototype in this repo shares.
//
// Deliberately loud and deliberately not in the Skin’s visual language: it must read as
// scaffolding, never as part of the design being judged. Never rendered in a production build.

export interface PrototypeVariant {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: readonly PrototypeVariant[];
  current: string;
  onChange: (key: string) => void;
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: PrototypeSwitcherProps): React.JSX.Element | null {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  // Wraps in both directions, so flipping never dead-ends at an edge.
  const step = React.useCallback(
    (delta: number): void => {
      const next = (index + delta + variants.length) % variants.length;
      onChange(variants[next].key);
    },
    [index, onChange, variants],
  );

  // ← / → cycle too, but never while a field has focus: a prototype of a form would
  // otherwise swallow caret movement.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const active = document.activeElement;
      const tag = active?.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      step(event.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step]);

  // A stray merge cannot ship the bar to users.
  if (process.env.NODE_ENV === "production") return null;

  const variant = variants[index];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 lg:bottom-6">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full border-2 border-black bg-white px-2 py-1.5 shadow-lg">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous prototype variant"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-black hover:bg-black/10"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="label-mono min-w-0 break-words px-1 text-center text-[10px] font-semibold text-black">
          PROTOTYPE · {variant.key} · {variant.name}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next prototype variant"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-black hover:bg-black/10"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
