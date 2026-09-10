import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getSession,
  getOrCreateLearner,
  appendMessage,
  getRecentMessages,
  getMessagesToFold,
  recordUsage,
  updateSessionSummary,
  getSettings,
} from "@/db/repositories";
import { updateLearnerLevel } from "@/db/learning-repository";
import { handleTutorMessage, type GovernanceDecisionEvent } from "@/tutor-core/conversation/orchestrator";
import { summarizeConversation, estimateTokens } from "@/tutor-core/conversation/summarize";
import { buildTopicKeywords } from "@/tutor-core/learning/topics";
import { detectStatedLevel } from "@/tutor-core/learning/level-detection";
import { TUTOR_AGENT_IDENTITY } from "@/tutor-core/governance/types";
import type { Source } from "@/tutor-core/conversation/types";
import { OpenRouterProvider } from "@/providers/llm/openrouter";
import { GitBookMCPProvider } from "@/providers/knowledge/gitbook-mcp";
import { PassthroughGovernanceProvider } from "@/providers/governance/passthrough";
import { recordGovernanceEvent } from "@/db/governance-repository";
import { checkGovernance } from "@/app/api/_lib/governance";
import { checkRateLimit } from "@/app/api/_lib/rate-limit";
import { tutorConfig, shouldSummarizeSession } from "@/config/tutor.config";

// POST /api/tutor/stream — spec §42 main pipeline, streamed to the client
// as newline-delimited JSON TutorEvents (spec §15). One process-wide
// provider instance each: GitBookMCPProvider caches its MCP connection,
// OpenRouterProvider is stateless.

const llmProvider = new OpenRouterProvider();
const knowledgeProvider = new GitBookMCPProvider();
const governanceProvider = new PassthroughGovernanceProvider();
const topicKeywords = buildTopicKeywords();

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  anonymousId: z.string().uuid(),
  message: z.string().min(1).max(4000),
});

// The most expensive endpoint in the app (retrieval + LLM generation per
// call), and the one a scripted client would hit hardest — tightest
// budget of the four rate-limited routes.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "tutor.stream", RATE_LIMIT, RATE_WINDOW_MS);
  if (rateLimit.limited) {
    // A plain JSON body would get silently dropped by the client's NDJSON
    // line-parser (it buffers an unterminated final line and never flushes
    // it) — shape this as one real TutorEvent line instead, so the
    // existing `event.type === "error"` handling in chat-client.tsx
    // surfaces it like any other mid-stream error.
    const event = { type: "error", code: "rate_limited", message: "Too many messages — please slow down." };
    return new Response(JSON.stringify(event) + "\n", {
      status: 429,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
    });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid_request", message: parsed.error.message }), {
      status: 400,
    });
  }
  const { sessionId, anonymousId, message } = parsed.data;

  const session = await getSession(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: "not_found", message: "Session not found." }), {
      status: 404,
    });
  }

  const learner = await getOrCreateLearner(anonymousId);
  const settings = await getSettings();

  const recentTurns = (await getRecentMessages(sessionId, tutorConfig.sessionSummary.triggerTurns))
    .filter((m): m is typeof m & { role: "user" | "assistant" } => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  await appendMessage({ sessionId, learnerId: learner.id, role: "user", content: message });

  // A learner can restate their level mid-conversation without ever
  // revisiting the onboarding picker (see tutor-core/learning/level-detection.ts).
  // Persist it through the same governance boundary as the onboarding
  // write (spec §61), and use it for this turn's answer immediately rather
  // than waiting for the next message.
  let effectiveLevel = learner.overallLevel;
  const statedLevel = detectStatedLevel(message);
  if (statedLevel && statedLevel !== learner.overallLevel) {
    const levelDecision = await checkGovernance(governanceProvider, {
      capability: "learner.progress.write",
      resource: "overall_level",
      purpose: "chat_stated_level_update",
      sessionId,
      learnerId: learner.id,
    });
    if (levelDecision.decision === "ALLOW") {
      await updateLearnerLevel(learner.id, statedLevel);
      effectiveLevel = statedLevel;
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let fullText = "";
      let sources: Source[] = [];
      const governanceEvents: GovernanceDecisionEvent[] = [];

      try {
        for await (const event of handleTutorMessage(
          { sessionId, userId: anonymousId, message, inputMode: "text" },
          {
            llmProvider,
            knowledgeProvider,
            governanceProvider,
            topicKeywords,
            learnerLevel: effectiveLevel,
            sessionSummary: session.conversationSummary,
            recentTurns,
            pedagogicalModeEnabled: settings.pedagogicalModeEnabled,
            customPrompt: settings.customPrompt,
            onGovernanceDecision: (e) => governanceEvents.push(e),
          }
        )) {
          if (event.type === "text_complete") fullText = event.text;
          if (event.type === "retrieval_complete") sources = event.sources;
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", code: "internal", message: "The tutor is temporarily unavailable." }) +
              "\n"
          )
        );
      } finally {
        controller.close();
      }

      await Promise.all(
        governanceEvents.map((e) =>
          recordGovernanceEvent({
            sessionId,
            learnerId: learner.id,
            actorId: TUTOR_AGENT_IDENTITY.id,
            capability: e.capability,
            resource: e.resource,
            decision: e.decision.decision,
            reasonCode: e.decision.reasonCode,
          })
        )
      );

      if (!fullText) return;

      await appendMessage({
        sessionId,
        learnerId: learner.id,
        role: "assistant",
        content: fullText,
        sourcesJson: sources,
        llmProvider: tutorConfig.llm.provider,
        llmModel: tutorConfig.llm.model,
      });

      await recordUsage({
        sessionId,
        learnerId: learner.id,
        provider: tutorConfig.llm.provider,
        model: tutorConfig.llm.model,
        capability: "llm",
        latencyMs: Date.now() - startedAt,
      });

      const toFold = await getMessagesToFold(
        sessionId,
        session.summarizedThrough,
        tutorConfig.sessionSummary.triggerTurns
      );
      const tokensToFold = toFold.reduce((sum, m) => sum + estimateTokens(m.content), 0);

      const lastToFold = toFold.at(-1);
      if (lastToFold && shouldSummarizeSession(toFold.length, tokensToFold)) {
        try {
          const newSummary = await summarizeConversation(session.conversationSummary, toFold, llmProvider);
          await updateSessionSummary(sessionId, newSummary, lastToFold.createdAt);
        } catch {
          // Summarization is a cost/context optimization, not required for
          // this turn's answer — failing silently here is fine (spec §38
          // principle: don't fail the conversation over a non-critical step).
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
