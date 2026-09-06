import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateLearner, createSession } from "@/db/repositories";
import { tutorConfig } from "@/config/tutor.config";
import { topics } from "@/tutor-core/learning/topics";

// POST /api/tutor/session
// Creates a new guest TutorSession (spec §24). No login required — every
// session is a guest session identified by a client-generated anonymous id
// (spec decision: no login in v1).

const BodySchema = z.object({ anonymousId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: "anonymousId (uuid) is required." },
      { status: 400 }
    );
  }

  const learner = await getOrCreateLearner(parsed.data.anonymousId);
  const session = await createSession(learner.id);

  return NextResponse.json({
    sessionId: session.id,
    anonymousId: learner.anonymousId,
    overallLevel: learner.overallLevel,
    product: tutorConfig.product,
    tutorName: tutorConfig.tutorName,
    topics,
  });
}
