import { tutorConfig } from "../../config/tutor.config";

// spec §61 — re-exports the governance contract from providers/types plus
// the conceptual agent-identity shape used once real governance is
// wired in. Derived from tutorConfig rather than hard-coded so this stays
// correct regardless of which product/GitBook this deployment tutors.
export type {
  GovernanceRequest,
  GovernanceDecision,
  GovernanceDecisionType,
  GovernanceProvider,
} from "../providers/types";

export interface AgentIdentity {
  id: string;
  version: string;
  owner: string;
  purpose: string;
  capabilities: string[];
  prohibited: string[];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export const TUTOR_AGENT_IDENTITY: AgentIdentity = {
  id: `${slugify(tutorConfig.product)}-tutor`,
  version: "1.0",
  owner: tutorConfig.product,
  purpose: "education-and-developer-onboarding",
  capabilities: [
    "docs.read",
    "docs.search",
    "tutor.respond",
    "quiz.generate",
    "learner.progress.read",
    "learner.progress.write",
  ],
  prohibited: ["wallet.sign", "asset.transfer", "mainnet.execute", "credentials.export"],
};
