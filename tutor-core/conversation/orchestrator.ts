import type {
  LLMProvider,
  KnowledgeProvider,
  GovernanceProvider,
  GovernanceDecision,
  KnowledgeResult,
} from "../providers/types";
import type { TutorRequest, TutorEvent, Source } from "./types";
import { classifyKnowledgeRequirement, KnowledgeRequirement, buildSearchQuery, type TopicKeywords } from "../knowledge/classify";
import { getGlossaryResult } from "../knowledge/glossary";
import { buildTutorContext, type ConversationTurn, type PromptOverrides } from "./context";
import { TUTOR_AGENT_IDENTITY } from "../governance/types";
import { tutorConfig } from "../../config/tutor.config";
import type { LearnerLevel } from "../learning/types";

// spec §42 — the core message pipeline. Framework-agnostic on purpose (no
// DB/Next.js imports): the API route (app/api/tutor/stream) loads
// learner/session state, drives this generator, and persists the result —
// that keeps this module testable with mocked providers.

export interface GovernanceDecisionEvent {
  capability: string;
  resource?: string;
  decision: GovernanceDecision;
}

export interface TutorOrchestratorDeps extends PromptOverrides {
  llmProvider: LLMProvider;
  knowledgeProvider: KnowledgeProvider;
  governanceProvider: GovernanceProvider;
  topicKeywords: TopicKeywords[];
  learnerLevel?: LearnerLevel | null;
  sessionSummary?: string | null;
  recentTurns: ConversationTurn[];
  // spec §61 evidence — the route logs every decision to governance_events;
  // this stays a plain callback (not a DB import) so tutor-core keeps no
  // framework/infra dependencies.
  onGovernanceDecision?: (event: GovernanceDecisionEvent) => void;
}

async function checkGovernance(
  deps: TutorOrchestratorDeps,
  request: TutorRequest,
  capability: string,
  resource?: string
): Promise<GovernanceDecision> {
  const decision = await deps.governanceProvider.evaluate({
    actor: { id: TUTOR_AGENT_IDENTITY.id, type: "agent" },
    capability,
    resource,
    purpose: "answer_user_question",
    context: { sessionId: request.sessionId, userId: request.userId },
  });
  deps.onGovernanceDecision?.({ capability, resource, decision });
  return decision;
}

export async function* handleTutorMessage(
  request: TutorRequest,
  deps: TutorOrchestratorDeps
): AsyncGenerator<TutorEvent> {
  const requirement = classifyKnowledgeRequirement(request.message, deps.topicKeywords);

  let results: KnowledgeResult[] = [];
  let sources: Source[] = [];

  if (requirement !== KnowledgeRequirement.NONE) {
    const governanceDecision = await checkGovernance(
      deps,
      request,
      "docs.search",
      tutorConfig.knowledge.endpoint
    );

    if (governanceDecision.decision === "ALLOW") {
      yield { type: "retrieval_started" };
      try {
        const searchQuery = buildSearchQuery(
          request.message,
          deps.sessionSummary ?? null,
          deps.recentTurns
        );
        results = await deps.knowledgeProvider.search(searchQuery);

        const glossary = await getGlossaryResult(deps.knowledgeProvider);
        if (glossary && !results.some((r) => r.url && r.url === glossary.url)) {
          results = [...results, glossary];
        }

        sources = results.map((r) => ({ id: r.id, title: r.title, url: r.url, section: r.section }));
        yield { type: "retrieval_complete", sources };
      } catch {
        // spec §38 — MCP failure must not fail the whole conversation.
        yield {
          type: "error",
          code: "mcp_unavailable",
          message: `I couldn't retrieve the current ${tutorConfig.product} documentation for that question.`,
        };
      }
    }
  }

  const inferenceDecision = await checkGovernance(deps, request, "llm.inference", tutorConfig.llm.model);
  if (inferenceDecision.decision !== "ALLOW") {
    yield {
      type: "error",
      code: "governance_denied",
      message: "The tutor is temporarily unavailable.",
    };
    yield { type: "complete" };
    return;
  }

  const context = buildTutorContext({
    learnerLevel: deps.learnerLevel,
    sessionSummary: deps.sessionSummary,
    recentTurns: deps.recentTurns,
    sources: results,
    userMessage: request.message,
    pedagogicalModeEnabled: deps.pedagogicalModeEnabled,
    customPrompt: deps.customPrompt,
  });

  let fullText = "";
  try {
    for await (const chunk of deps.llmProvider.streamChat({ messages: context })) {
      if (chunk.delta) {
        fullText += chunk.delta;
        yield { type: "text_delta", delta: chunk.delta };
      }
    }
  } catch {
    yield { type: "error", code: "llm_failed", message: "The tutor is temporarily unavailable." };
    yield { type: "complete" };
    return;
  }

  yield { type: "text_complete", text: fullText };

  // spec §20 — mastery updates are evidence-gated (quiz answers, not free
  // chat), so they're triggered from app/api/quiz/[id]/answer, not here.

  yield { type: "complete" };
}
