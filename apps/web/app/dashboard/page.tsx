import { auth } from "@clerk/nextjs/server";

// Server-side so the Clerk JWT is attached to the API call without ever
// reaching the browser. The FastAPI backend verifies it via JWKS and
// get-or-creates the Fitness Profile, which we then render.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

type ProfileEnvelope = {
  success: boolean;
  data: { id: number; clerk_user_id: string; display_name: string | null } | null;
  error: string | null;
};

async function fetchProfile(): Promise<ProfileEnvelope> {
  const { getToken } = await auth();
  const token = await getToken();

  const response = await fetch(`${API_URL}/api/profile`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  return (await response.json()) as ProfileEnvelope;
}

export default async function DashboardPage() {
  const envelope = await fetchProfile();

  if (!envelope.success || !envelope.data) {
    return (
      <section>
        <h1>Dashboard</h1>
        <p role="alert">Could not load your profile: {envelope.error ?? "unknown error"}</p>
      </section>
    );
  }

  const profile = envelope.data;
  return (
    <section>
      <h1>Your Fitness Profile</h1>
      <p>This profile round-tripped through Postgres on the FastAPI backend.</p>
      <dl>
        <dt>Clerk user</dt>
        <dd>{profile.clerk_user_id}</dd>
        <dt>Display name</dt>
        <dd>{profile.display_name ?? "(not set yet)"}</dd>
      </dl>
    </section>
  );
}
