import "server-only";

import { auth } from "@clerk/nextjs/server";

// The single typed HTTP transport seam for the web client (ADR-0022). Every
// server-side read and write goes through `apiGet`/`apiSend`, which own base-URL
// prefixing, Clerk JWT attach, `fetch`, `cache: "no-store"`, and the envelope cast.
// The eleven `lib/*.ts` data-access modules keep only their paths, methods, and
// request/response types and delegate the transport here. The seam returns the raw
// `Envelope`; the `.success`/`.data`/`.error` unwrap stays at the ~30 call sites, the
// front-end twin of the backend's `StructuredLLM` port returning raw text (ADR-0006).
//
// `import "server-only"` makes any accidental import from a Client Component fail at
// build time, so the JWT-attach path can never leak into the browser bundle.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

// Pagination metadata a paginated endpoint attaches alongside `data`: the full record
// `total` across every page, and the `limit`/`offset` window this page was read with.
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

// The standard wire envelope every backend endpoint returns. Declared once here so
// the domain modules stop re-declaring it and `apiGet`/`apiSend` can name their
// return type; callers keep inferring it. `meta` rides only on paginated responses.
export interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: PaginationMeta;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { getToken } = await auth();
  const token = await getToken();
  return { Authorization: `Bearer ${token}` };
}

// Read a backend endpoint. Attaches the Clerk JWT, prefixes the API base URL, sets
// `cache: "no-store"`, and returns the raw envelope for the caller to unwrap.
export async function apiGet<T>(path: string): Promise<Envelope<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<T>;
}

// Write to a backend endpoint (POST, PUT, or DELETE). `Content-Type: application/json`
// and the JSON-stringified body are attached only when a `body` is passed; a bodyless
// call (the `substitute` POST, a `DELETE`) sends neither, byte-for-byte as before
// (ADR-0022).
export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<Envelope<T>> {
  const headers = await authHeaders();
  const init: RequestInit =
    body === undefined
      ? { method, headers, cache: "no-store" }
      : {
          method,
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        };
  const response = await fetch(`${API_URL}${path}`, init);
  return (await response.json()) as Envelope<T>;
}
