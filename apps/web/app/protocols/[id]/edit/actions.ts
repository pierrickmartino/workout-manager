"use server";

import { deployProtocol } from "@/lib/protocols";
import type { DeployPayload } from "@/lib/protocol-builder";
import type { ProtocolProgress } from "@/lib/protocols-types";

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
