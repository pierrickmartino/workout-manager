// PROTOTYPE — throwaway shared UI. A floating bottom-centre bar that cycles a `?variant=` URL
// param with arrows or ← / → keys. Deliberately high-contrast so it reads as scaffolding, not
// part of the design being judged. Hidden in production builds so a stray merge can't ship it.

"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PrototypeVariant {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariant[];
  current: string;
  onChange: (key: string) => void;
}

export function PrototypeSwitcher({ variants, current, onChange }: PrototypeSwitcherProps) {
  const index = Math.max(0, variants.findIndex((variant) => variant.key === current));
  const active = variants[index];

  function step(delta: number) {
    const next = (index + delta + variants.length) % variants.length;
    onChange(variants[next].key);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-neutral-900 px-2 py-1.5 text-white shadow-xl shadow-black/40">
        <button
          type="button"
          aria-label="Previous variant"
          onClick={() => step(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-[180px] px-2 text-center font-mono text-[12px]">
          <span className="font-semibold">{active?.key}</span>
          <span className="mx-1.5 text-white/40">—</span>
          <span className="text-white/80">{active?.name}</span>
        </span>
        <button
          type="button"
          aria-label="Next variant"
          onClick={() => step(1)}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
