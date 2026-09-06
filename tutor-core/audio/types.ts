// spec §10 — sentence-level TTS chunking pipeline. Implemented in Phase 3.

export interface TtsQueueItem {
  sentence: string;
  index: number;
}

/**
 * Splits streamed LLM text into speakable sentences, skipping markdown
 * syntax, URLs, and code blocks per spec §10. Placeholder for Phase 3 —
 * kept here so the conversation orchestrator has a stable import path to
 * wire against once TTS lands.
 */
export function splitIntoSpeakableSentences(_text: string): string[] {
  throw new Error("Not implemented — Phase 3 (spec §10).");
}
