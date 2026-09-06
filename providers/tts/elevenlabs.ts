import type { TTSProvider, TTSOptions, TTSResult } from "../../tutor-core/providers/types";

// spec §9 — Phase 3. Real REST call is implemented now (endpoint is stable
// and documented) even though nothing invokes it until voice output lands.

export class ElevenLabsProvider implements TTSProvider {
  constructor(
    private readonly apiKey: string = process.env.ELEVENLABS_API_KEY ?? "",
    private readonly defaultVoiceId: string = process.env.ELEVENLABS_VOICE_ID ?? "",
    private readonly defaultModel: string = process.env.ELEVENLABS_MODEL ?? "eleven_turbo_v2_5"
  ) {}

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    if (!this.apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not configured.");
    }

    const voiceId = options?.voiceId ?? this.defaultVoiceId;
    if (!voiceId) {
      throw new Error("No ElevenLabs voice id configured.");
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: options?.model ?? this.defaultModel,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs request failed: ${response.status} ${response.statusText}`);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return { audio, mimeType: "audio/mpeg" };
  }
}
