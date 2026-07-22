"use client";

import { useEffect } from "react";

// Registers the minimal installability service worker (public/sw.js, ADR-0028)
// once, after the page is interactive. Rendering nothing, it exists only for the
// side effect: Chrome suppresses "Add to Home Screen" unless a service worker
// with a fetch handler is registered. The SW itself is network-only for
// navigations, so registering it never caches authenticated pages.
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    // Register after load so it never competes with first-paint work.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failing (e.g. non-HTTPS dev over LAN) degrades to a
        // normal web page — no install, no offline fallback. Not fatal.
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
