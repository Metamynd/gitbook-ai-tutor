import { z } from "zod";
import type { LLMProvider } from "../providers/types";
import type { QuizQuestion, QuizEvaluationResult } from "./types";

// spec §22 — structured LLM evaluation, Zod-validated before it's trusted.

const EvaluationSchema = z.object({
  score: z.number().min(0).max(1),
  correct: z.boolean(),
  strengths: z.array(z.string()),
  missing: z.array(z.string()),
  misconceptions: z.array(z.string()),
  feedback: z.string(),
});

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\n?/, "").replace(/```\s*$/, "").trim();
}

export async function evaluateQuizAnswer(params: {
  question: QuizQuestion;
  learnerAnswer: string;
  llmProvider: LLMProvider;
}): Promise<QuizEvaluationResult> {
  const { question, learnerAnswer } = params;

  const prompt = `Grade a learner's answer to this quiz question.

Question (${question.type}): ${question.question}
${question.options ? `Options: ${question.options.join(" / ")}\n` : ""}Expected/model answer: ${question.expectedAnswer}
Why that's correct: ${question.explanation}

Learner's answer: ${learnerAnswer}

Respond with STRICT JSON only (no markdown fences), matching exactly:
{
  "score": 0.0,
  "correct": false,
  "strengths": ["..."],
  "missing": ["..."],
  "misconceptions": ["..."],
  "feedback": "one short, encouraging paragraph speaking directly to the learner"
}

For multiple_choice/true_false, "correct" is exact-match against the expected option and "score" is 0 or 1. For open-ended types, judge on substance, not exact wording — partial credit is fine.`;

  let raw = "";
  for await (const chunk of params.llmProvider.streamChat({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  })) {
    raw += chunk.delta;
  }

  return EvaluationSchema.parse(JSON.parse(stripJsonFences(raw)));
}
