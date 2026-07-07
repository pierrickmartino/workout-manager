import { notFound } from "next/navigation";

import { LiveSessionScreen } from "@/components/LiveSessionScreen";
import { fetchLiveSession } from "@/lib/sessions";

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

  const session = envelope.data;
  const today = new Date().toISOString().slice(0, 10);

  return <LiveSessionScreen session={session} today={today} />;
}
