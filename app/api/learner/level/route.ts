import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateLearner } from "@/db/repositories";
import { updateLearnerLevel } from "@/db/learning-repository";
import { PassthroughGovernanceProvider } from "@/providers/governance/passthrough";
import { checkGovernance } from "@/app/api/_lib/governance";

// POST /api/learner/level — spec §17/§18 onboarding: the learner picks a
// level once (Phase 4). Not in the spec's original endpoint list, but
// needed for the onboarding UI to persist the choice.

const governanceProvider = new PassthroughGovernanceProvider();

const BodySchema = z.object({
  anonymousId: z.string().uuid(),
  level: z.enum(["beginner", "intermediate", "developer", "advanced"]),
});

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", message: parsed.error.message }, { status: 400 });
  }

  const learner = await getOrCreateLearner(parsed.data.anonymousId);

  const decision = await checkGovernance(governanceProvider, {
    capability: "learner.progress.write",
    resource: "overall_level",
    purpose: "set_learner_level",
    learnerId: learner.id,
  });
  if (decision.decision !== "ALLOW") {
    return NextResponse.json({ error: "governance_denied", message: "Couldn't save that." }, { status: 403 });
  }

  await updateLearnerLevel(learner.id, parsed.data.level);

  return NextResponse.json({ ok: true });
}
