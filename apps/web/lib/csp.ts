// Content-Security-Policy builder — the single source of truth for the web app's
// DOM-XSS defense (ADR-0036, #257). Pure: no Clerk import, no I/O. It returns the
// config handed to Clerk's `clerkMiddleware({ contentSecurityPolicy })` option,
// which generates the per-request nonce and merges Clerk's own required hosts.

export interface ContentSecurityPolicyConfig {
  strict: boolean;
  directives: Record<string, string[]>;
}

// The value for the separate `Content-Security-Policy-Report-Only` header. Trusted
// Types is the strongest DOM-XSS defense, but React 19 + Clerk are expected to emit
// violations, so it is observed in report-only mode first (ADR-0036, #257) and only
// enforced after a clean run.
export function buildTrustedTypesReportOnly(): string {
  return "require-trusted-types-for 'script'";
}

export function buildContentSecurityPolicy(): ContentSecurityPolicyConfig {
  return {
    strict: true,
    directives: {
      // Hardening floor (ADR-0036). Clerk's strict mode owns script-src; these
      // are the injection/clickjacking directives the app-wide CSP adds on top.
      "default-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"],
      "form-action": ["'self'"],
      "worker-src": ["'self'", "blob:"],
      "img-src": ["'self'", "https://img.clerk.com", "data:"],
      "style-src": ["'self'", "'unsafe-inline'"],
    },
  };
}
