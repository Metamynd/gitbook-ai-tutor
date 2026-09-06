import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateLearner } from "@/db/repositories";
import { getMisconceptions } from "@/db/learning-repository";
import { PassthroughGovernanceProvider } from "@/providers/governance/passthrough";
import { checkGovernance } from "@/app/api/_lib/governance";

// GET /api/learner/profile?anonymousId=... — spec §18 learner state.

const governanceProvider = new PassthroughGovernanceProvider();

const QuerySchema = z.object({ anonymousId: z.string().uuid() });

export async function GET(req: NextRequest) {
  const parsed = QuerySchema.safeParse({
    anonymousId: req.nextUrl.searchParams.get("anonymousId"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: "anonymousId (uuid query param) is required." },
      { status: 400 }
    );
  }

  const learner = await getOrCreateLearner(parsed.data.anonymousId);

  const decision = await checkGovernance(governanceProvider, {
    capability: "learner.progress.read",
    purpose: "view_profile",
    learnerId: learner.id,
  });
  if (decision.decision !== "ALLOW") {
    return NextResponse.json({ error: "governance_denied", message: "Couldn't load your profile." }, { status: 403 });
  }

  const misconceptions = await getMisconceptions(learner.id);

  return NextResponse.json({
    overallLevel: learner.overallLevel,
    misconceptions,
  });
}
