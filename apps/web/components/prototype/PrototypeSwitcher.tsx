"use client";

// PROTOTYPE — throwaway. A floating bottom bar that cycles a page's `?variant=` search param so UI
// variants can be compared in place. Never ships: it renders nothing in a production build.

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";

interface PrototypeSwitcherProps {
  variants: readonly { key: string; name: string }[];
  current: string;
}

export function PrototypeSwitcher({ variants, current }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  function go(step: number) {
    const next = variants[(index + step + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next.key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  const active = variants[index];
  return (
    // Deliberately off-palette (inline, outside the Skin tokens) so it never reads as the design.
    <div
      className="fixed bottom-20 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full border-2 px-2 py-1 font-mono text-[12px] shadow-2xl lg:bottom-4"
      style={{ background: "#000", color: "#fde047", borderColor: "#facc15" }}
    >
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => go(-1)}
        className="rounded-full p-1.5 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="px-2 whitespace-nowrap">
        PROTOTYPE · {active.key} ({active.name})
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => go(1)}
        className="rounded-full p-1.5 hover:underline"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
