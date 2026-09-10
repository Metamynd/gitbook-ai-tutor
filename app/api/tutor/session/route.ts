import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateLearner, createSession } from "@/db/repositories";
import { tutorConfig } from "@/config/tutor.config";
import { topics } from "@/tutor-core/learning/topics";
import { checkRateLimit } from "@/app/api/_lib/rate-limit";

// POST /api/tutor/session
// Creates a new guest TutorSession. No login required — every session is
// a guest session identified by a client-generated anonymous id.

const BodySchema = z.object({ anonymousId: z.string().uuid() });

// Cheap DB writes, but this is the entry point into every learner/session
// row in the system and has no auth in front of it — bound how fast one
// caller can mint them.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "tutor.session", RATE_LIMIT, RATE_WINDOW_MS);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests — please slow down." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

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
