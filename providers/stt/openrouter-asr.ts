import type { STTProvider, STTOptions, STTResult } from "../../tutor-core/providers/types";

// spec §7 — Phase 2. OpenRouter's audio-transcription request shape hasn't
// been verified against the Qwen3 ASR model yet; this follows OpenAI-style
// multipart transcription conventions as a starting point. Confirm the
// exact endpoint/payload against OpenRouter's docs before Phase 2 work
// begins — do not assume this is correct.

const OPENROUTER_TRANSCRIPTION_URL = "https://openrouter.ai/api/v1/audio/transcriptions";

export class OpenRouterASRProvider implements STTProvider {
  constructor(
    private readonly apiKey: string = process.env.OPENROUTER_API_KEY ?? "",
    private readonly defaultModel: string = process.env.STT_MODEL ?? ""
  ) {}

  async transcribe(audio: Buffer, options?: STTOptions): Promise<STTResult> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    }

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)]), "audio.webm");
    form.append("model", options?.model ?? this.defaultModel);
    if (options?.language) form.append("language", options.language);

    const response = await fetch(OPENROUTER_TRANSCRIPTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`OpenRouter ASR request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      transcript: data.text ?? "",
      confidence: data.confidence,
      durationMs: data.duration ? data.duration * 1000 : undefined,
      detectedLanguage: data.language,
    };
  }
}
