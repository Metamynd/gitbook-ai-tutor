import { tutorConfig } from "../../config/tutor.config";

// spec §12 — classify whether a message needs the configured product's
// documentation before deciding whether to call the GitBook MCP provider
// at all.
//
// Decision: use a cheap keyword/taxonomy heuristic instead of an LLM call.
// An extra LLM round-trip on every message would add latency and cost to
// every turn just to decide whether to retrieve docs — the taxonomy in
// content/curriculum/topics.json already gives us the vocabulary to match
// against for free. Revisit only if the heuristic proves too imprecise.
//
// Bug found in testing: this used to default to NONE (skip retrieval)
// unless a topic keyword or the product name matched. "I am a developer.
// Show me where to start." — one of the app's own suggested starter
// questions — matches neither, so retrieval was skipped entirely and the
// LLM fabricated a plausible-sounding but fictional SDK/IDE-extension
// onboarding flow with zero grounding. This is a single-product tutor:
// almost every substantive question is implicitly about that product, so
// the default now is to retrieve unless the message is clearly not a
// question needing product knowledge (a greeting, thanks, or a short
// quiz-answer-style reply). A search call is far cheaper than a
// hallucinated answer.

export enum KnowledgeRequirement {
  NONE = "NONE",
  DOCS_REQUIRED = "DOCS_REQUIRED",
  DOCS_OPTIONAL = "DOCS_OPTIONAL",
}

export interface TopicKeywords {
  topicId: string;
  keywords: string[];
}

const QUIZ_PATTERN = /\bquiz\b|\btest me\b/i;

// Short, clearly non-substantive turns — nothing here needs product
// documentation. Deliberately narrow: anything not matched here retrieves.
const NON_SUBSTANTIVE_PATTERN =
  /^(hi|hello|hey|thanks|thank you|thx|ok|okay|sure|got it|cool|nice|great|yes|no|yep|nope)[.!?]?$/i;

function productNamePattern(): RegExp {
  const escaped = tutorConfig.product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

export function classifyKnowledgeRequirement(
  message: string,
  topicKeywords: TopicKeywords[]
): KnowledgeRequirement {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (NON_SUBSTANTIVE_PATTERN.test(lower)) {
    return KnowledgeRequirement.NONE;
  }

  const matchedTopic = topicKeywords.some(({ keywords }) =>
    keywords.some((kw) => lower.includes(kw.toLowerCase()))
  );

  if (matchedTopic || QUIZ_PATTERN.test(lower) || productNamePattern().test(lower)) {
    return KnowledgeRequirement.DOCS_REQUIRED;
  }

  // Default to retrieving rather than skipping — see rationale above.
  return KnowledgeRequirement.DOCS_OPTIONAL;
}

// A stated interface/channel (dashboard vs CLI vs API) is often mentioned
// once and never repeated, but the search query below is built from only
// the current message. Without detecting it from earlier context too, the
// tutor-system-prompt.md rule telling the model to match the stated channel
// has nothing to work with — the search itself never looked for that
// channel's docs, so it can't find them even when they exist.
const CHANNEL_KEYWORDS: Record<string, string[]> = {
  dashboard: ["dashboard", "the ui", "web interface", "web app", "the console"],
  cli: ["cli", "command line", "command-line", "terminal"],
  api: ["api", "sdk", "programmatically", "rest endpoint"],
};

export function detectStatedChannel(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [channel, keywords] of Object.entries(CHANNEL_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return channel;
  }
  return null;
}

// If the current message already names a channel, the query is fine as-is.
// Otherwise, check the session summary and recent turns for a channel the
// learner stated earlier and fold it into the search query so retrieval can
// actually find channel-specific docs.
export function buildSearchQuery(
  message: string,
  sessionSummary: string | null,
  recentTurns: { content: string }[]
): string {
  if (detectStatedChannel(message)) return message;

  const priorContext = [sessionSummary ?? "", ...recentTurns.map((t) => t.content)].join(" ");
  const statedChannel = detectStatedChannel(priorContext);
  return statedChannel ? `${message} (via the ${statedChannel})` : message;
}
