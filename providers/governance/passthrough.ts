import type { GovernanceProvider, GovernanceRequest, GovernanceDecision } from "../../tutor-core/providers/types";

// always ALLOW — replace with a real GovernanceProvider when you have one.
// Every call site now routes through this (widened from just docs.search
// in Phase 1 to llm.inference and learner.progress.read/write too), so
// swapping this for a real governance provider later is a one-line change
// with no call-site rework — that's the point of the interface existing
// from day one (spec §61's closing principle).
export class PassthroughGovernanceProvider implements GovernanceProvider {
  async evaluate(_request: GovernanceRequest): Promise<GovernanceDecision> {
    return { decision: "ALLOW", reasonCode: "PASSTHROUGH_DEFAULT_ALLOW" };
  }
}
