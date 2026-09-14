// The shared inverse of the backend's write-boundary HTML escaping (`html.escape(quote=True)`,
// the nonce-CSP DOM-XSS posture of ADR-0036). Several fields are escaped once when stored — an
// Exercise Note, a Set Note, an Exercise's precautions — so the stored value is inert wherever
// it lands (a CSV export, a raw-HTML reader). A React view must *decode* that stored value
// before rendering: React renders the decoded string as a text node and re-escapes it for the
// DOM, so nothing can execute, and the reader sees the text the user typed (`a & b`) rather than
// the raw entity (`a &amp; b`). Without this, an escaped-at-write field displays double-escaped.
//
// No server-only imports, so it is safe in both Server and Client Components and unit-testable
// without a browser.

// The five entities `html.escape(quote=True)` produces, mapped back to their characters.
// `&amp;` is applied **last** — the exact inverse of the escape, which replaces `&` first — so an
// already-decoded `&` (or a literal, doubly-escaped entity like `&amp;lt;`) is never re-consumed.
export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}
