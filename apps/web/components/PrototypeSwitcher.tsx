"use client";

// PROTOTYPE — throwaway. A floating bar that cycles a page's `?variant=` search param so a UI
// prototype's variants can be compared in place (.claude/skills/prototype/UI.md). Never ships:
// it renders nothing in a production build.

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";

export interface PrototypeVariant {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: readonly PrototypeVariant[];
  current: string;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
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
      if (isTyping(event.target)) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;
  const variant = variants[index];

  return (
    // Inline colours, deliberately off every Skin: the bar must not read as part of the design.
    <div
      style={{ background: "#000", color: "#fff", boxShadow: "0 0 0 2px #fde047, 0 10px 30px rgb(0 0 0 / 0.5)" }}
      className="fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full px-1.5 py-1.5 font-mono text-[12px] lg:bottom-6"
    >
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="flex h-8 w-8 items-center justify-center rounded-full hover:opacity-70"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="whitespace-nowrap px-2">
        <span className="font-bold" style={{ color: "#fde047" }}>{variant.key}</span> ({variant.name})
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next variant"
        className="flex h-8 w-8 items-center justify-center rounded-full hover:opacity-70"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
