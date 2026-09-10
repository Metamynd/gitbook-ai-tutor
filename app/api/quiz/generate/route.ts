import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreateLearner } from "@/db/repositories";
import { generateQuizQuestion } from "@/tutor-core/quiz/generate";
import { topics } from "@/tutor-core/learning/topics";
import { OpenRouterProvider } from "@/providers/llm/openrouter";
import { GitBookMCPProvider } from "@/providers/knowledge/gitbook-mcp";
import { PassthroughGovernanceProvider } from "@/providers/governance/passthrough";
import { checkGovernance } from "@/app/api/_lib/governance";
import { checkRateLimit } from "@/app/api/_lib/rate-limit";

// POST /api/quiz/generate — spec §21. Retrieves docs for the chosen topic
// first so the question is grounded, then asks the LLM to write it.

const llmProvider = new OpenRouterProvider();
const knowledgeProvider = new GitBookMCPProvider();
const governanceProvider = new PassthroughGovernanceProvider();

const BodySchema = z.object({
  anonymousId: z.string().uuid(),
  topicId: z.string(),
});

// Every call is a docs search plus an LLM generation — real cost per
// request, so this gets a tighter budget than plain reads.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "quiz.generate", RATE_LIMIT, RATE_WINDOW_MS);
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

  const topic = topics.find((t) => t.id === parsed.data.topicId);
  if (!topic) {
    return NextResponse.json({ error: "not_found", message: "Unknown topic." }, { status: 404 });
  }

  const learner = await getOrCreateLearner(parsed.data.anonymousId);

  let sources: Awaited<ReturnType<typeof knowledgeProvider.search>> = [];
  const searchDecision = await checkGovernance(governanceProvider, {
    capability: "docs.search",
    resource: topic.id,
    purpose: "generate_quiz_question",
    learnerId: learner.id,
  });
  if (searchDecision.decision === "ALLOW") {
    try {
      sources = await knowledgeProvider.search(topic.title);
    } catch {
      // spec §38 — fall through with no sources; generateQuizQuestion asks a
      // conceptual question instead of a specific one when sources are empty.
    }
  }

  const inferenceDecision = await checkGovernance(governanceProvider, {
    capability: "llm.inference",
    purpose: "generate_quiz_question",
    learnerId: learner.id,
  });
  if (inferenceDecision.decision !== "ALLOW") {
    return NextResponse.json(
      { error: "governance_denied", message: "Couldn't generate a quiz question right now." },
      { status: 403 }
    );
  }

  try {
    const question = await generateQuizQuestion({
      topicId: topic.id,
      topicTitle: topic.title,
      sources: sources.slice(0, 5),
      llmProvider,
    });
    return NextResponse.json({ question });
  } catch {
    return NextResponse.json(
      { error: "generation_failed", message: "Couldn't generate a quiz question right now." },
      { status: 502 }
    );
  }
}
