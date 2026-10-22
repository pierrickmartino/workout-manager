"use client";

// PROTOTYPE — throwaway. A floating bottom bar that cycles a page’s `?variant=` search
// param so a UI prototype’s variants can be flipped in the browser. Never ships: it
// renders nothing in a production build.

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";

interface PrototypeVariant {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: readonly PrototypeVariant[];
  current: string;
  // Extra state worth seeing on every switch, e.g. "streak 3 · PR yes".
  stateLine?: string;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

export function PrototypeSwitcher({
  variants,
  current,
  stateLine,
}: PrototypeSwitcherProps): React.JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const go = React.useCallback(
    (step: number) => {
      const next = variants[(index + step + variants.length) % variants.length];
      const params = new URLSearchParams(window.location.search);
      params.set("variant", next.key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [index, pathname, router, variants],
  );

  React.useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") return null;

  const variant = variants[index];
  return (
    <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-magenta bg-elevated px-2 py-1.5 shadow-2xl lg:bottom-6">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="rounded-full p-1.5 text-text-primary hover:bg-surface"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="flex flex-col items-center px-2 text-center">
        <span className="label-mono text-[11px] text-text-primary">
          {variant.key} ({variant.name})
        </span>
        {stateLine ? (
          <span className="label-mono text-[9px] text-text-muted">
            {stateLine}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="rounded-full p-1.5 text-text-primary hover:bg-surface"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
