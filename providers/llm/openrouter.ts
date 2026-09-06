import { createParser } from "eventsource-parser";
import type { LLMProvider, LLMRequest, LLMChunk } from "../../tutor-core/providers/types";

// spec §5, §6 — first LLM provider implementation. Model id comes from env,
// never hard-coded, so swapping models (or moving to RunPod later, spec
// §56) doesn't touch tutor logic.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string = process.env.OPENROUTER_API_KEY ?? "",
    private readonly defaultModel: string = process.env.LLM_MODEL ?? ""
  ) {}

  async *streamChat(request: LLMRequest): AsyncIterable<LLMChunk> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured.");
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model ?? this.defaultModel,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let pendingChunks: LLMChunk[] = [];
    const parser = createParser((event) => {
      if (event.type !== "event") return;

      if (event.data === "[DONE]") {
        pendingChunks.push({ delta: "", done: true });
        return;
      }
      try {
        const parsed = JSON.parse(event.data);
        const delta: string = parsed.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          pendingChunks.push({ delta });
        }
      } catch {
        // ignore malformed SSE frames
      }
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
      for (const chunk of pendingChunks) {
        yield chunk;
      }
      pendingChunks = [];
    }
  }
}
