"use client";

import { useState } from "react";

export type QuizQuestion = {
  id: string;
  topicId: string;
  type: "multiple_choice" | "true_false" | "short_answer" | "explanation" | "scenario";
  question: string;
  options?: string[];
  expectedAnswer: string;
  explanation: string;
  sourceIds: string[];
  difficulty: number;
};

export type QuizEvaluationResult = {
  score: number;
  correct: boolean;
  strengths: string[];
  missing: string[];
  misconceptions: string[];
  feedback: string;
};

// spec §21/§22 — a distinct structured card (not free chat text), since a
// quiz question has real fields (options, an expected answer) that a
// plain markdown message can't represent or grade against.
export function QuizCard({
  question,
  evaluation,
  submitting,
  onSubmit,
}: {
  question: QuizQuestion;
  evaluation: QuizEvaluationResult | null;
  submitting: boolean;
  onSubmit: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const isChoice = question.type === "multiple_choice" || question.type === "true_false";
  const locked = submitting || !!evaluation;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="font-mono text-xs uppercase tracking-wide text-gray-400">
        Quiz · {question.type.replace("_", " ")}
      </div>
      <p className="mt-2 text-sm font-medium text-brand-slate">{question.question}</p>

      {isChoice ? (
        <div className="mt-3 space-y-2">
          {question.options?.map((opt) => (
            <label
              key={opt}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-sm ${
                answer === opt ? "border-transparent bg-gradient-brand-soft" : "border-gray-200"
              } ${locked ? "cursor-default opacity-80" : ""}`}
            >
              <input
                type="radio"
                name={question.id}
                checked={answer === opt}
                disabled={locked}
                onChange={() => setAnswer(opt)}
                className="accent-[#6366F1]"
              />
              {opt}
            </label>
          ))}
        </div>
      ) : (
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={locked}
          rows={3}
          placeholder="Your answer..."
          className="mt-3 w-full rounded-xl border border-gray-200 p-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 disabled:opacity-80"
        />
      )}

      {!evaluation && (
        <button
          onClick={() => onSubmit(answer)}
          disabled={locked || !answer.trim()}
          className="mt-3 rounded-full bg-gradient-brand-primary px-4 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {submitting ? "Grading..." : "Submit"}
        </button>
      )}

      {evaluation && (
        <div className="mt-3 border-t border-gray-100 pt-3 text-sm">
          <div className={`font-medium ${evaluation.correct ? "text-emerald-600" : "text-amber-600"}`}>
            {evaluation.correct ? "Correct" : "Not quite"} · {Math.round(evaluation.score * 100)}%
          </div>
          <p className="mt-1 text-brand-slate">{evaluation.feedback}</p>
          {evaluation.missing.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs text-gray-500">
              {evaluation.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
