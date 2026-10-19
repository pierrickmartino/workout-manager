"use client";

// PROTOTYPE — throwaway. Floating bottom bar that cycles `?variant=` on the current route.
// Writes the param with `replaceState` (keeping every other query param, e.g. catalog
// filters) and tells the host, so the variant is shareable and reload-stable without
// re-running the Server Component. Never renders in a production build.

import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";

interface PrototypeSwitcherProps {
  variants: readonly string[];
  names?: Record<string, string>;
  current: string;
  onChange: (variant: string) => void;
}

export function PrototypeSwitcher({ variants, names, current, onChange }: PrototypeSwitcherProps) {
  const index = Math.max(0, variants.indexOf(current));
  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length];
    const params = new URLSearchParams(window.location.search);
    params.set("variant", next);
    window.history.replaceState(null, "", `?${params.toString()}`);
    onChange(next);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#fde047] p-1 text-[#111] shadow-xl shadow-black/40 lg:bottom-6">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant" className="rounded-full p-1.5 hover:bg-black/10">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-36 px-2 text-center font-mono text-[12px] font-bold">
        {current}
        {names?.[current] ? ` (${names[current]})` : ""}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant" className="rounded-full p-1.5 hover:bg-black/10">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
