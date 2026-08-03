// Where the "back" control on the Exercise Detail screen should point. Exercise
// Detail is a global catalog screen reachable from many origins — a Session's
// Exercise, a Protocol's Exercise, the Dashboard's latest-PR card, the Analytics
// strength tiles, and a related Variation/Alternative on the screen itself — so
// "back" is not a fixed destination. Each link that opens the screen carries its
// origin as a `?from=` path, and this module turns that into the labelled BackLink
// target. A missing or untrusted origin falls back to the Dashboard rather than
// stranding the user, which is the dead-end this screen used to be.
//
// Pure and server-free (no Clerk, no fetch), so it is safe to import from both
// Server and Client Components.

export interface BackTarget {
  // An internal path the BackLink navigates to.
  href: string;
  // The link's visible text, matching the app's "Back to …" convention.
  label: string;
}

// The honest fallback when no trustworthy origin is known — a shared/deep link, a
// bookmark, or a crafted `from`: the Dashboard, labelled for what it is rather than
// claiming a "session" we cannot prove the user came from.
const FALLBACK: BackTarget = { href: "/dashboard", label: "Back to dashboard" };

// The first path segment of an origin → its "Back to …" label. Only the areas that
// actually link into Exercise Detail are named; a valid-but-unrecognised area
// resolves to the Dashboard fallback rather than a guessed label.
const AREA_LABELS: Record<string, string> = {
  sessions: "Back to session",
  protocols: "Back to protocol",
  exercises: "Back to exercise",
  analytics: "Back to analytics",
  dashboard: "Back to dashboard",
};

// Accept only a same-origin absolute path ("/sessions/12"). Everything else —
// `undefined`/`null`, a protocol-relative "//evil.com", a "/\\evil" backslash
// trick, or an absolute "https://evil.com" URL — is rejected, so a crafted `?from=`
// can never turn the back link into an off-site navigation. The value is compared
// post-decode (Next.js decodes searchParams), which is where an injected "//" or
// "scheme:" would surface.
export function sanitizeInternalPath(
  from: string | null | undefined,
): string | null {
  if (typeof from !== "string") return null;
  // A single leading slash followed by a non-slash, non-backslash character rules
  // out "", "/", "//…", and "/\…", as well as any "scheme:" or bare "host" form.
  if (!/^\/[^/\\]/.test(from)) return null;
  return from;
}

// Resolve the `?from=` origin into the BackLink target. A trusted internal path in a
// recognised area is honoured with its own label; anything else — untrusted, absent,
// or a valid path in an area we don't link from — falls back to the Dashboard.
export function backTarget(from: string | null | undefined): BackTarget {
  const safe = sanitizeInternalPath(from);
  if (safe === null) return FALLBACK;

  const area = safe.split("/")[1] ?? "";
  const label = AREA_LABELS[area];
  if (label === undefined) return FALLBACK;

  return { href: safe, label };
}

// Append the current origin to an outgoing `/exercises/[id]` link as `?from=`, so the
// opened screen — and every tab switch or related-Exercise hop from it — can send the
// user back where they started. An untrusted or absent origin is simply not appended,
// and the destination then shows the Dashboard fallback. Composes with an href that
// already carries a query (the tab links) by switching separators.
export function appendFrom(
  href: string,
  from: string | null | undefined,
): string {
  const safe = sanitizeInternalPath(from);
  if (safe === null) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}from=${encodeURIComponent(safe)}`;
}
