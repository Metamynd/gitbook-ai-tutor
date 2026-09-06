import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateLearner } from "@/db/repositories";
import { getTopicMastery } from "@/db/learning-repository";
import { topics } from "@/tutor-core/learning/topics";
import { getLearningPaths } from "@/tutor-core/learning/learning-paths";
import { PassthroughGovernanceProvider } from "@/providers/governance/passthrough";
import { checkGovernance } from "@/app/api/_lib/governance";

// GET /api/learner/progress?anonymousId=... — spec §18/§23: topic mastery
// plus each learning path annotated with per-topic mastery, so the client
// can render progress without a separate lesson_progress round trip.

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
    purpose: "view_progress",
    learnerId: learner.id,
  });
  if (decision.decision !== "ALLOW") {
    return NextResponse.json({ error: "governance_denied", message: "Couldn't load your progress." }, { status: 403 });
  }

  const mastery = await getTopicMastery(learner.id);

  const topicProgress = topics.map((t) => ({
    id: t.id,
    title: t.title,
    mastery: mastery[t.id]?.mastery ?? 0,
    attempts: mastery[t.id]?.attempts ?? 0,
  }));

  const learningPaths = getLearningPaths().map((path) => ({
    ...path,
    topics: path.topics.map((topicId) => ({
      id: topicId,
      title: topics.find((t) => t.id === topicId)?.title ?? topicId,
      mastery: mastery[topicId]?.mastery ?? 0,
    })),
  }));

  return NextResponse.json({ topics: topicProgress, learningPaths });
}
