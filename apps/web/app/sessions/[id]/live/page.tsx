import { notFound } from "next/navigation";

import { LiveSessionScreen } from "@/components/LiveSessionScreen";
import { fetchLiveSession } from "@/lib/sessions";
import { fetchProfile } from "@/lib/profile";
import { resolveAppearance } from "@/lib/appearance";

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

  const envelope = await fetchLiveSession(sessionId);
  if (!envelope.success || !envelope.data) {
    notFound();
  }

  // The user's default rest-timer setting seeds the rest countdown (issue #121). A
  // failed/empty profile read simply leaves it null — the Live Session then falls
  // back to each prescription's own rest, so the workout is never blocked on it.
  const profile = await fetchProfile();
  const defaultRestSeconds = profile.data?.default_rest_seconds ?? null;

  // The user's Keep Screen Awake preference (issue #386 — ADR-0055), from the same
  // Interface Preference the root layout reads for Mode. `resolveAppearance`
  // get-or-defaults (on) and never throws, so a signed-out/unreachable read simply
  // ships the default rather than blocking the workout — the same pattern as
  // `defaultRestSeconds` above.
  const { keep_screen_awake: keepScreenAwake, weight_unit: unit } =
    await resolveAppearance();

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
