import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateLearner, recordUsage } from "@/db/repositories";
import { applyMasteryDelta, recordMisconception, insertQuizAttempt } from "@/db/learning-repository";
import { evaluateQuizAnswer } from "@/tutor-core/quiz/evaluate";
import { computeMasteryDelta } from "@/tutor-core/learning/mastery";
import { OpenRouterProvider } from "@/providers/llm/openrouter";
import { PassthroughGovernanceProvider } from "@/providers/governance/passthrough";
import { checkGovernance } from "@/app/api/_lib/governance";
import { checkRateLimit } from "@/app/api/_lib/rate-limit";
import { tutorConfig } from "@/config/tutor.config";

// POST /api/quiz/:id/answer — spec §22 evaluation, then the ONE place
// mastery updates happen (spec §20: evidence-gated, not on every chat
// turn). The full question is echoed back by the client rather than
// looked up by id — avoids a quiz_questions table for what's otherwise a
// stateless generate-then-grade flow.

const llmProvider = new OpenRouterProvider();
const governanceProvider = new PassthroughGovernanceProvider();

// One LLM grading call per request — same budget as quiz generation, a
// touch looser since one generate naturally leads to one answer.
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

const QuestionSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  type: z.enum(["multiple_choice", "true_false", "short_answer", "explanation", "scenario"]),
  question: z.string(),
  options: z.array(z.string()).optional(),
  expectedAnswer: z.string(),
  explanation: z.string(),
  sourceIds: z.array(z.string()),
  difficulty: z.number(),
});

const BodySchema = z.object({
  anonymousId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  question: QuestionSchema,
  answer: z.string().min(1),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const rateLimit = checkRateLimit(req, "quiz.answer", RATE_LIMIT, RATE_WINDOW_MS);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests — please slow down." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", message: parsed.error.message }, { status: 400 });
  }
  const { question, answer } = parsed.data;

  const learner = await getOrCreateLearner(parsed.data.anonymousId);

  const inferenceDecision = await checkGovernance(governanceProvider, {
    capability: "llm.inference",
    purpose: "evaluate_quiz_answer",
    sessionId: parsed.data.sessionId,
    learnerId: learner.id,
  });
  if (inferenceDecision.decision !== "ALLOW") {
    return NextResponse.json(
      { error: "governance_denied", message: "Couldn't grade that answer right now." },
      { status: 403 }
    );
  }

  const startedAt = Date.now();

  let evaluation;
  try {
    evaluation = await evaluateQuizAnswer({ question, learnerAnswer: answer, llmProvider });
  } catch {
    return NextResponse.json(
      { error: "evaluation_failed", message: "Couldn't grade that answer right now." },
      { status: 502 }
    );
  }

  await recordUsage({
    sessionId: parsed.data.sessionId,
    learnerId: learner.id,
    provider: tutorConfig.llm.provider,
    model: tutorConfig.llm.model,
    capability: "llm",
    latencyMs: Date.now() - startedAt,
  });

  await insertQuizAttempt({
    learnerId: learner.id,
    sessionId: parsed.data.sessionId ?? null,
    questionId: question.id,
    topicId: question.topicId,
    answer,
    score: evaluation.score,
    correct: evaluation.correct,
    feedback: evaluation.feedback,
  });

  const writeDecision = await checkGovernance(governanceProvider, {
    capability: "learner.progress.write",
    resource: question.topicId,
    purpose: "record_quiz_result",
    sessionId: parsed.data.sessionId,
    learnerId: learner.id,
  });

  if (writeDecision.decision === "ALLOW") {
    await applyMasteryDelta(learner.id, question.topicId, computeMasteryDelta(evaluation.score), evaluation.correct);

    for (const description of evaluation.misconceptions) {
      await recordMisconception(learner.id, question.topicId, description);
    }
  }

  return NextResponse.json({ evaluation });
}
