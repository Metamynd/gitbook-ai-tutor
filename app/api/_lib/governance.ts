import { TUTOR_AGENT_IDENTITY } from "@/tutor-core/governance/types";
import { recordGovernanceEvent } from "@/db/governance-repository";
import type { GovernanceProvider, GovernanceDecision } from "@/tutor-core/providers/types";

// spec §61 — evaluate + log in one call, for routes that call governance
// synchronously (the streaming orchestrator uses a callback instead,
// since it can't await a DB write mid-generator — see
// tutor-core/conversation/orchestrator.ts's onGovernanceDecision).
// Prefixed with _lib so Next's app router doesn't treat this as a route.
export async function checkGovernance(
  governanceProvider: GovernanceProvider,
  params: {
    capability: string;
    resource?: string;
    purpose: string;
    sessionId?: string | null;
    learnerId?: string | null;
  }
): Promise<GovernanceDecision> {
  const decision = await governanceProvider.evaluate({
    actor: { id: TUTOR_AGENT_IDENTITY.id, type: "agent" },
    capability: params.capability,
    resource: params.resource,
    purpose: params.purpose,
    context: { sessionId: params.sessionId ?? undefined },
  });

  await recordGovernanceEvent({
    sessionId: params.sessionId,
    learnerId: params.learnerId,
    actorId: TUTOR_AGENT_IDENTITY.id,
    capability: params.capability,
    resource: params.resource,
    decision: decision.decision,
    reasonCode: decision.reasonCode,
  });

  return decision;
}
