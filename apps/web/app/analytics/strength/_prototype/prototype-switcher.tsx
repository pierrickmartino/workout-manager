"use client";

// PROTOTYPE — throwaway. The floating variant switcher from the /prototype skill:
// a fixed bottom-centre pill that cycles `?variant=` via the router (reload-stable,
// shareable) and the ← / → arrow keys. Hidden in production builds so a stray merge
// can never ship it. See ./README.md.

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PrototypeSwitcherProps {
  variants: readonly string[];
  // Human label per variant key, e.g. { A: "Headline & Ledger" }.
  labels: Record<string, string>;
  current: string;
}

export function PrototypeSwitcher({
  variants,
  labels,
  current,
}: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = useCallback(
    (step: number) => {
      const index = Math.max(0, variants.indexOf(current));
      const next = variants[(index + step + variants.length) % variants.length];
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [variants, current, searchParams, router, pathname],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        go(-1);
      } else if (event.key === "ArrowRight") {
        go(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-full border border-border-lite bg-elevated/95 px-1.5 py-1.5 shadow-xl backdrop-blur">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous variant"
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="label-mono px-2 text-[11px] font-semibold tracking-wider text-text-primary">
          <span className="text-cyan">{current}</span>
          {labels[current] ? (
            <span className="text-text-muted"> — {labels[current]}</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next variant"
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
