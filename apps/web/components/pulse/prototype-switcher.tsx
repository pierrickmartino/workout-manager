"use client";

// PROTOTYPE — throwaway. A floating bar that cycles `?variant=` on the current route, so a
// UI prototype's variants can be flipped in the browser (see .claude/skills/prototype/UI.md).
// Hidden in production builds, so a stray merge cannot ship it.

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";

export interface PrototypeVariant {
  key: string;
  name: string;
}

interface PrototypeSwitcherProps {
  variants: readonly PrototypeVariant[];
}

function isProduction(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "production";
}

export function usePrototypeVariant(variants: readonly PrototypeVariant[]): string {
  const params = useSearchParams();
  if (isProduction()) return variants[0].key;
  const requested = params.get("variant");
  return variants.some((variant) => variant.key === requested) ? (requested as string) : variants[0].key;
}

export function PrototypeSwitcher({ variants }: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = usePrototypeVariant(variants);
  const index = variants.findIndex((variant) => variant.key === current);

  function go(step: number) {
    const next = variants[(index + step + variants.length) % variants.length];
    const query = new URLSearchParams(params.toString());
    query.set("variant", next.key);
    router.replace(`${pathname}?${query.toString()}`);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (isProduction()) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-2 py-1.5 font-mono text-[12px] text-white shadow-lg">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant" className="rounded-full p-1.5">
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="whitespace-nowrap px-1">
        {current} · {variants[index].name}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant" className="rounded-full p-1.5">
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
