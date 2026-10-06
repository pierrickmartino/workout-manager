"use client";

// PROTOTYPE — throwaway. The floating variant switcher for UI prototypes: ← / → cycle the
// `?variant=` search param, so a variant is shareable and survives a reload. Renders nothing
// in a production build, so a stray merge cannot ship it.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";

export interface PrototypeVariant {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: readonly PrototypeVariant[];
  current: string;
  // The prototype's live state, printed under the label so every switch shows what it holds.
  state?: string;
}

export function PrototypeSwitcher({
  variants,
  current,
  state,
}: PrototypeSwitcherProps): React.JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const index = Math.max(0, variants.findIndex((variant) => variant.key === current));
  const active = variants[index];

  function go(step: number): void {
    const next = variants[(index + step + variants.length) % variants.length];
    router.replace(`${pathname}?variant=${next.key}`, { scroll: false });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")
      ) {
        return;
      }
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-6">
      <div className="flex items-center gap-1 rounded-full border-2 border-text-primary bg-base px-1.5 py-1.5 shadow-2xl">
        <button
          type="button"
          aria-label="Previous variant"
          onClick={() => go(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-text-primary hover:bg-elevated"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-col items-center px-2 text-center">
          <span className="label-mono text-[11px] font-bold text-text-primary">
            {active.key} · {active.name}
          </span>
          {state ? (
            <span className="label-mono text-[10px] text-text-secondary">{state}</span>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Next variant"
          onClick={() => go(1)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-text-primary hover:bg-elevated"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
