// spec §21, §22 — quiz engine and evaluation.

export type QuizQuestionType =
  | "multiple_choice"
  | "true_false"
  | "short_answer"
  | "explanation"
  | "scenario";

export interface QuizQuestion {
  id: string;
  topicId: string;
  type: QuizQuestionType;

  question: string;
  options?: string[];
  expectedAnswer: string;
  explanation: string;
  sourceIds: string[];
  difficulty: number;
}

// Structured output of LLM-based evaluation for open-ended answers.
// Validate against this shape with Zod before trusting it (spec §22).
export interface QuizEvaluationResult {
  score: number;
  correct: boolean;
  strengths: string[];
  missing: string[];
  misconceptions: string[];
  feedback: string;
}
