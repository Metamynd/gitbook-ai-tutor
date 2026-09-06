// spec §33 — usage/cost tracking. Written on every LLM/STT/TTS call.

export interface UsageRecord {
  provider: string;
  model: string;
  capability: "llm" | "stt" | "tts";

  inputTokens?: number;
  outputTokens?: number;

  audioSeconds?: number;
  characters?: number;

  estimatedCostUsd?: number;

  latencyMs: number;

  userId?: string;
  sessionId?: string;
}
