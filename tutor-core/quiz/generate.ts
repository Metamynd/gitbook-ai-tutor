import { z } from "zod";
import type { LLMProvider, KnowledgeResult } from "../providers/types";
import type { QuizQuestion } from "./types";
import { tutorConfig } from "../../config/tutor.config";

// spec §21 — "Quiz questions must be grounded in MCP documentation where
// product facts are involved." Retrieval happens before this is called
// (the caller passes in the sources); this only ever asks the LLM to
// write a question from what's in front of it, never from memory.

const GeneratedQuestionSchema = z.object({
  type: z.enum(["multiple_choice", "true_false", "short_answer", "explanation", "scenario"]),
  question: z.string(),
  options: z.array(z.string()).optional(),
  expectedAnswer: z.string(),
  explanation: z.string(),
  difficulty: z.number().min(0).max(1),
});

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\n?/, "").replace(/```\s*$/, "").trim();
}

export async function generateQuizQuestion(params: {
  topicId: string;
  topicTitle: string;
  sources: KnowledgeResult[];
  llmProvider: LLMProvider;
}): Promise<QuizQuestion> {
  const docsBlock = params.sources
    .map((s, i) => `SOURCE ${i + 1}\nTitle: ${s.title}\n${s.content}`)
    .join("\n\n---\n\n");

  const prompt = `Write one quiz question about "${params.topicTitle}" for ${tutorConfig.product}, grounded ONLY in the documentation excerpts below. Do not test any fact that isn't stated in these excerpts — if the excerpts are thin, ask a more conceptual question rather than inventing a specific detail.

Documentation:
${docsBlock || "(nothing retrieved — ask a conceptual question about what this topic is for, not a specific implementation detail)"}

Respond with STRICT JSON only (no markdown fences), matching exactly:
{
  "type": "multiple_choice" | "true_false" | "short_answer" | "explanation" | "scenario",
  "question": "...",
  "options": ["...", "..."],
  "expectedAnswer": "...",
  "explanation": "...",
  "difficulty": 0.3
}

"options" is required (4 choices) for multiple_choice, ["True", "False"] for true_false, and omitted for every other type. "expectedAnswer" is the correct option's text for multiple_choice/true_false, or a model answer for open-ended types. "explanation" says why, citing the documentation. "difficulty" is 0 (easy) to 1 (hard).`;

  let raw = "";
  for await (const chunk of params.llmProvider.streamChat({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
  })) {
    raw += chunk.delta;
  }

  const parsed = GeneratedQuestionSchema.parse(JSON.parse(stripJsonFences(raw)));

  return {
    id: crypto.randomUUID(),
    topicId: params.topicId,
    type: parsed.type,
    question: parsed.question,
    options: parsed.options,
    expectedAnswer: parsed.expectedAnswer,
    explanation: parsed.explanation,
    sourceIds: params.sources.map((s) => s.id),
    difficulty: parsed.difficulty,
  };
}
