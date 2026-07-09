"use server";

import { deployProtocol } from "@/lib/protocols";
import { searchExercises } from "@/lib/exercises";
import type { DeployPayload } from "@/lib/protocol-builder";
import type { ProtocolProgress } from "@/lib/protocols-types";
import type { ExerciseSearchResult } from "@/lib/exercises-types";

// Server action backing DEPLOY PROTOCOL. The Clerk JWT is attached server-side in
// `lib/protocols.ts` and never reaches the browser. Returns the progressed Protocol
// on success, or a user-safe message when the backend rejects the draft (ADR-0020).
export interface DeployResult {
  protocol: ProtocolProgress | null;
  error: string | null;
}

export async function submitDeploy(
  protocolId: number,
  payload: DeployPayload,
): Promise<DeployResult> {
  const result = await deployProtocol(protocolId, payload);
  if (!result.success || !result.data) {
    return { protocol: null, error: result.error ?? "Could not deploy the protocol." };
  }
  return { protocol: result.data, error: null };
}

// Result of an Exercise Library search: the ranked matches, or a user-safe message.
export interface SearchResult {
  results: ExerciseSearchResult[];
  error: string | null;
}

// Server action backing the Exercise Library browser. The Clerk JWT is attached
// server-side; the pick-only catalog search never creates an Exercise (ADR-0021).
export async function searchExerciseLibrary(
  query: string,
): Promise<SearchResult> {
  const result = await searchExercises(query);
  if (!result.success || !result.data) {
    return { results: [], error: result.error ?? "Could not search the library." };
  }
  return { results: result.data, error: null };
}
