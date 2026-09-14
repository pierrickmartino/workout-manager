import { apiGetRaw } from "@/lib/api";

// Same-origin render proxy for the curator Exercise Image (issue #504, ADR-0041). The browser's
// `<img src="/api/exercises/{id}/image">` hits THIS Next route handler, which forwards to the
// JWT-guarded backend `GET /api/exercises/{id}/image` with the Clerk token attached server-side
// (the token never reaches the browser, ADR-0022) and streams the bytes back. Without this hop
// a plain `<img>` could not authenticate to the API and would render broken; with it the tag
// stays plain and the image resolution logic (`resolveExerciseImageSrc`) just points here.
//
// Reading the Clerk token makes this dynamic; force it so Next never tries to cache the handler.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const exerciseId = Number(id);
  if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
    return new Response(null, { status: 404 });
  }

  const upstream = await apiGetRaw(`/api/exercises/${exerciseId}/image`);
  if (!upstream.ok) {
    // Forward the upstream status (401 unauthenticated, 404 no image) with no body, so the
    // caller falls back to the legacy URL or shows nothing — never a broken-but-200 image.
    return new Response(null, { status: upstream.status });
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/octet-stream",
      // Per-viewer, briefly cacheable; the editor cache-busts the URL after a replace.
      "Cache-Control": "private, max-age=300",
    },
  });
}
