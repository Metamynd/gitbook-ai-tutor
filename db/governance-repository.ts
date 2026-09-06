import { getPool } from "./client";
import type { GovernanceDecisionType } from "../tutor-core/providers/types";

// spec §61 governance evidence — decision-level, not token-level. Every
// governanceProvider.evaluate() call anywhere in the app should log one
// row here, regardless of which provider is behind it.

export interface GovernanceEvent {
  sessionId?: string | null;
  learnerId?: string | null;
  actorId: string;
  capability: string;
  resource?: string;
  decision: GovernanceDecisionType;
  reasonCode?: string;
}

export async function recordGovernanceEvent(event: GovernanceEvent): Promise<void> {
  await getPool().query(
    `insert into governance_events (session_id, learner_id, actor_id, capability, resource, decision, reason_code)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      event.sessionId ?? null,
      event.learnerId ?? null,
      event.actorId,
      event.capability,
      event.resource ?? null,
      event.decision,
      event.reasonCode ?? null,
    ]
  );
}

export interface RecentGovernanceEvent extends GovernanceEvent {
  createdAt: string;
}

export async function getRecentGovernanceEvents(limit: number): Promise<RecentGovernanceEvent[]> {
  const { rows } = await getPool().query(
    `select session_id, learner_id, actor_id, capability, resource, decision, reason_code, created_at
     from governance_events
     order by created_at desc
     limit $1`,
    [limit]
  );
  return rows.map((r) => ({
    sessionId: r.session_id,
    learnerId: r.learner_id,
    actorId: r.actor_id,
    capability: r.capability,
    resource: r.resource,
    decision: r.decision,
    reasonCode: r.reason_code,
    createdAt: r.created_at,
  }));
}
