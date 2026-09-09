import type { LLMProvider } from "../providers/types";
import type { ConversationTurn } from "./context";

// spec §24/§25 — folds older turns into a running summary so context stays
// bounded instead of growing the full transcript forever.

export async function summarizeConversation(
  existingSummary: string | null,
  turnsToFold: ConversationTurn[],
  llmProvider: LLMProvider
): Promise<string> {
  const transcript = turnsToFold.map((t) => `${t.role}: ${t.content}`).join("\n");

  // Explicitly calling out stated constraints (not just "goals or
  // confusions") matters: a learner who says "I only use the dashboard" or
  // names their platform/version once, then never repeats it, needs that
  // constraint to survive folding — otherwise later turns silently lose it
  // and the tutor can answer as if it was never said.
  const preserve =
    "preserve topics discussed, any learner-stated goals or confusions, and any " +
    "explicitly stated constraints or preferences (e.g. which interface/channel " +
    "they use — dashboard vs CLI vs API —, their platform, or their product version)";

  const prompt = existingSummary
    ? `Existing summary of the conversation so far:\n${existingSummary}\n\nFold in these additional turns and produce one updated, concise summary (a few sentences — ${preserve}):\n\n${transcript}`
    : `Summarize this conversation concisely (a few sentences — ${preserve}):\n\n${transcript}`;

  let summary = "";
  for await (const chunk of llmProvider.streamChat({ messages: [{ role: "user", content: prompt }], temperature: 0.2 })) {
    summary += chunk.delta;
  }
  return summary.trim();
}

// Threshold trigger only, not a billing computation — good enough to
// decide "is this getting long," not to estimate real token counts.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
