"use client";

// PROTOTYPE — throwaway. The floating variant switcher: a high-contrast pill fixed at
// bottom-centre, deliberately unlike the app chrome so it never reads as part of the design
// under review. ← / → (buttons and arrow keys) cycle variants and write ?variant= so a pick is
// shareable and reload-stable. Hidden entirely in production builds so a stray merge can't ship
// the bar.

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface VariantMeta {
  key: string;
  name: string;
}

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: VariantMeta[];
  current: string;
}): React.JSX.Element | null {
  const router = useRouter();
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const go = useCallback(
    (delta: number) => {
      const next = variants[(index + delta + variants.length) % variants.length];
      router.replace(`?variant=${next.key}`, { scroll: false });
    },
    [index, router, variants],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const active = variants[index];

  return (
    <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-full border border-white/15 bg-zinc-900 px-1.5 py-1.5 text-white shadow-2xl shadow-black/40">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous variant"
          className="rounded-full p-2 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[13rem] px-2 text-center font-mono text-[12px] tracking-wide">
          <span className="font-bold text-cyan-300">{active.key}</span>
          <span className="text-white/50"> — {active.name}</span>
          <span className="ml-2 text-white/30">
            {index + 1}/{variants.length}
          </span>
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next variant"
          className="rounded-full p-2 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
