import { notFound } from "next/navigation";

import { LiveSessionScreen } from "@/components/LiveSessionScreen";
import { fetchLiveSession } from "@/lib/sessions";
import { fetchProfile } from "@/lib/profile";
import { resolveAppearance } from "@/lib/appearance";
import { bestEffortData, settleBestEffort } from "@/lib/best-effort-read";

// Runs a user-owned Session live, recording it per set (issue #86 — F2·S1). The
// Session is fetched through the live hydration read (issue #90 — F2·S5), so the
// set rows pre-fill from progression-adjusted loads and each Exercise carries its
// previous performance to beat. The backend returns 404 (→ notFound) for anyone
// who does not own it, so non-owners never reach here.
export default async function LiveSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) notFound();

  // Three independent reads, settled together rather than in sequence (perf audit A3). This
  // one is worth more than its size suggests: the user has just tapped Start and is standing
  // in a gym on mobile data, so every serial round trip here is time between the tap and the
  // first set. Only the hydration read may reject into `notFound()`:
  //
  //   - The user's default rest-timer setting seeds the rest countdown (issue #121). A
  //     failed/empty profile read simply leaves it null — the Live Session then falls back to
  //     each prescription's own rest, so the workout is never blocked on it. `settleBestEffort`
  //     is what keeps that true now the read shares a settle (`lib/best-effort-read.ts`), and
  //     the unwrap is a shade stricter than the `profile.data?.` it replaces: it also requires
  //     `success`, so an unsuccessful envelope that carried a body now falls back to the
  //     prescription's own rest rather than trusting a figure the backend refused to stand
  //     behind.
  //   - The user's Keep Screen Awake preference (issue #386 — ADR-0055), from the same
  //     Interface Preference the root layout reads for Mode. `resolveAppearance`
  //     get-or-defaults (on) and is documented never to throw, so it needs no catch: a
  //     signed-out/unreachable read simply ships the default rather than blocking the workout.
  const [
    envelope,
    profileResult,
    { keep_screen_awake: keepScreenAwake, weight_unit: unit },
  ] = await Promise.all([
    fetchLiveSession(sessionId),
    settleBestEffort(fetchProfile()),
    resolveAppearance(),
  ]);

  if (!envelope.success || !envelope.data) {
    notFound();
  }

  const defaultRestSeconds =
    bestEffortData(profileResult)?.default_rest_seconds ?? null;

  const session = envelope.data;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <LiveSessionScreen
      session={session}
      today={today}
      defaultRestSeconds={defaultRestSeconds}
      keepScreenAwake={keepScreenAwake}
      unit={unit}
    />
  );
}
