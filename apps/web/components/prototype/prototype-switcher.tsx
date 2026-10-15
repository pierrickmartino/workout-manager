"use client";

// PROTOTYPE — throwaway (branch `prototype/session-card-unify`). Never merge to main.
//
// The floating variant switcher: ← / label / → at the bottom-centre, plus the ←/→ keys. Writes
// `?variant=` with `router.replace` (keeping every other param) so a variant is shareable and
// survives a reload. Hidden in production builds.

import { useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface PrototypeVariant {
  key: string;
  name: string;
}

export function currentVariantKey(
  searchParams: URLSearchParams | null,
  variants: readonly PrototypeVariant[],
): string {
  const raw = searchParams?.get("variant");
  return variants.some((v) => v.key === raw) ? (raw as string) : variants[0].key;
}

export function PrototypeSwitcher({
  variants,
}: {
  variants: readonly PrototypeVariant[];
}): React.JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = currentVariantKey(new URLSearchParams(searchParams.toString()), variants);
  const index = variants.findIndex((v) => v.key === current);

  const go = useCallback(
    (step: number) => {
      const next = variants[(index + step + variants.length) % variants.length];
      const params = new URLSearchParams(window.location.search);
      params.set("variant", next.key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [index, pathname, router, variants],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
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
  }, [go]);

  if (process.env.NODE_ENV === "production") return null;

  const label = variants[index];
  return (
    <div className="fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#ff00aa] px-2 py-1 font-mono text-[12px] text-white shadow-2xl">
      <button type="button" onClick={() => go(-1)} className="px-2 py-1" aria-label="Previous variant">
        ←
      </button>
      <span className="whitespace-nowrap px-1">
        {label.key} ({label.name})
      </span>
      <button type="button" onClick={() => go(1)} className="px-2 py-1" aria-label="Next variant">
        →
      </button>
    </div>
  );
}
