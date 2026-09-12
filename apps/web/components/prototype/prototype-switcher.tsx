"use client";

// PROTOTYPE — throwaway. The floating variant switcher shared by prototype routes: a
// high-contrast pill fixed at bottom-centre with ◀ / label / ▶. Arrows and the ←/→
// keys cycle the `?variant=` search param (shareable, reload-stable). Hidden in
// production builds so a stray prototype merge can never ship the bar to users.

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PrototypeVariant {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariant[];
  current: string;
}

export function PrototypeSwitcher({ variants, current }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentIndex = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  function goTo(index: number) {
    const wrapped = (index + variants.length) % variants.length;
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", variants[wrapped].key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      // Don't hijack arrow keys while the user is in a field.
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      goTo(currentIndex + (event.key === "ArrowRight" ? 1 : -1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, variants, pathname, searchParams]);

  if (process.env.NODE_ENV === "production") return null;

  const active = variants[currentIndex];
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-full border border-cyan/50 bg-elevated/95 p-1 shadow-lg shadow-black/40 backdrop-blur">
        <button
          type="button"
          onClick={() => goTo(currentIndex - 1)}
          aria-label="Previous variant"
          className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-cyan"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="flex items-center gap-2 px-3">
          <span className="label-mono text-[12px] font-bold text-cyan">
            {active.key}
          </span>
          <span className="font-mono text-[12px] text-text-primary">
            {active.name}
          </span>
          <span className="label-mono text-[9px] text-text-muted">
            {currentIndex + 1}/{variants.length}
          </span>
        </span>
        <button
          type="button"
          onClick={() => goTo(currentIndex + 1)}
          aria-label="Next variant"
          className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-cyan"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
