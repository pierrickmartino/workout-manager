"use client";

// PROTOTYPE — Field Guide exercise discovery. Throwaway; see README.md.
//
// The floating variant switcher: a high-contrast pill fixed at bottom-centre that cycles
// the `?variant=` search param (← / → arrows and keys, wrapping). Deliberately NOT part
// of the design under evaluation, and hidden in production builds so a stray merge can
// never ship it to users.

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import type { VariantSpec } from "./variant-catalog";

interface PrototypeSwitcherProps {
  variants: VariantSpec[];
  current: string;
}

export function PrototypeSwitcher({
  variants,
  current,
}: PrototypeSwitcherProps): React.JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const goTo = useCallback(
    (nextIndex: number) => {
      const wrapped = (nextIndex + variants.length) % variants.length;
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", variants[wrapped].key);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [variants, searchParams, router, pathname],
  );

  // ← / → cycle, but never steal the keys from a focused text field (search box, etc.).
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
      if (event.key === "ArrowLeft") goTo(index - 1);
      if (event.key === "ArrowRight") goTo(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  // Belt-and-braces: never render in a production build.
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-full border border-cyan/40 bg-base/95 px-1.5 py-1.5 shadow-lg shadow-black/30 backdrop-blur">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          aria-label="Previous variant"
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-elevated hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-[9.5rem] flex-col items-center px-2 leading-tight">
          <span className="label-mono text-[9px] text-text-muted">
            PROTOTYPE · {index + 1}/{variants.length}
          </span>
          <span className="label-mono text-[11px] text-cyan">
            {variants[index].key} — {variants[index].name}
          </span>
        </div>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          aria-label="Next variant"
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-elevated hover:text-text-primary"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
