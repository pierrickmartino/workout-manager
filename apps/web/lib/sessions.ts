import { auth } from "@clerk/nextjs/server";

// Server-side data access for standalone Session generation. The Clerk JWT is
// attached here and never reaches the browser; the FastAPI backend verifies it
// via JWKS, then runs the AI generation path (ADR-0006).
const API_URL = process.env.API_URL ?? "http://localhost:8000";

// Training types a Session can be generated for. Mirrors the Fitness Level
// dimensions used elsewhere in the app.
export const TRAINING_TYPES = [
  "strength",
  "cardio",
  "hiit",
  "yoga",
  "mobility",
] as const;

export type TrainingType = (typeof TRAINING_TYPES)[number];

// The prescription of one Exercise within a Session — the sets/reps/etc. the
// user is told to perform, joined to its catalog Exercise definition.
export interface ExercisePrescription {
  position: number;
  sets: number;
  reps: string;
  rest_seconds: number | null;
  tempo: string | null;
  recommended_load: string | null;
  exercise_id: number;
  exercise_name: string;
  exercise_description: string | null;
  targeted_muscles: string[];
  required_equipment: string[];
  provenance: string;
}

export interface WorkoutSession {
  id: number;
  clerk_user_id: string;
  training_type: string;
  duration_minutes: number;
  prescriptions: ExercisePrescription[];
}

// The request the user submits to generate a standalone Session.
export interface GenerateSessionInput {
  training_type: string;
  duration_minutes: number;
  equipment: string[];
}

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { getToken } = await auth();
  const token = await getToken();
  return { Authorization: `Bearer ${token}` };
}

export async function generateSession(
  input: GenerateSessionInput,
): Promise<Envelope<WorkoutSession>> {
  const response = await fetch(`${API_URL}/api/sessions/generate`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<WorkoutSession>;
}

export async function fetchSession(
  id: number,
): Promise<Envelope<WorkoutSession>> {
  const response = await fetch(`${API_URL}/api/sessions/${id}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<WorkoutSession>;
}
