"use client";

// PROTOTYPE — throwaway. The floating variant switcher for UI prototypes (`/prototype` skill).
// Not production UI: it renders nothing in a production build, and the variant it reports is
// always the first one there, so a stray merge cannot ship a variant or the bar.

import { useEffect, useState } from "react";

import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";

export interface PrototypeVariant {
  key: string;
  name: string;
}

const PARAM = "variant";

const IS_PRODUCTION =
  typeof process !== "undefined" && process.env.NODE_ENV === "production";

function readVariant(keys: readonly string[]): string {
  if (IS_PRODUCTION || typeof window === "undefined") return keys[0];
  const value = new URLSearchParams(window.location.search).get(PARAM);
  return value !== null && keys.includes(value) ? value : keys[0];
}

function writeVariant(key: string): void {
  const params = new URLSearchParams(window.location.search);
  params.set(PARAM, key);
  window.history.replaceState(null, "", `?${params.toString()}`);
}

// Re-adds the `?variant=` a screen's own `replaceFilterQuery` would otherwise drop.
export function withPrototypeVariant(params: URLSearchParams): URLSearchParams {
  if (IS_PRODUCTION) return params;
  const current = new URLSearchParams(window.location.search).get(PARAM);
  if (current === null) return params;
  const next = new URLSearchParams(params);
  next.set(PARAM, current);
  return next;
}

// The current variant key, read from the URL after mount (so server and client agree on the
// first paint), plus a setter that writes it back.
export function usePrototypeVariant(
  variants: readonly PrototypeVariant[],
): [string, (key: string) => void] {
  const keys = variants.map((v) => v.key);
  const [current, setCurrent] = useState(keys[0]);
  useEffect(() => {
    setCurrent(readVariant(keys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function select(key: string): void {
    setCurrent(key);
    writeVariant(key);
  }
  return [current, select];
}

function isTyping(target: EventTarget | null): boolean {
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
  onChange,
}: {
  variants: readonly PrototypeVariant[];
  current: string;
  onChange: (key: string) => void;
}): React.JSX.Element | null {
  const index = Math.max(0, variants.findIndex((v) => v.key === current));
  const step = (delta: number) =>
    onChange(variants[(index + delta + variants.length) % variants.length].key);

  useEffect(() => {
    if (IS_PRODUCTION) return;
    function onKey(event: KeyboardEvent): void {
      if (isTyping(event.target)) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (IS_PRODUCTION) return null;
  const variant = variants[index];
  return (
    <div
      role="toolbar"
      aria-label="Prototype variant"
      className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-dashed border-amber bg-base px-2 py-1 shadow-2xl lg:bottom-6"
    >
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => step(-1)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-amber hover:bg-elevated"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="label-mono whitespace-nowrap px-2 text-[11px] text-amber">
        PROTOTYPE · {variant.key} ({variant.name})
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => step(1)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-amber hover:bg-elevated"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
