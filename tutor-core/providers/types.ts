// Provider interfaces (spec §5). The application must depend only on these
// contracts — never directly on OpenRouter, ElevenLabs, or the MCP SDK.

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMChunk {
  delta: string;
  done?: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface LLMProvider {
  streamChat(request: LLMRequest): AsyncIterable<LLMChunk>;
}

export interface STTOptions {
  model?: string;
  language?: string;
}

export type STTResult = {
  transcript: string;
  confidence?: number;
  durationMs?: number;
  detectedLanguage?: string;
};

export interface STTProvider {
  transcribe(audio: Buffer, options?: STTOptions): Promise<STTResult>;
}

export interface TTSOptions {
  voiceId?: string;
  model?: string;
}

export interface TTSResult {
  audio: Buffer;
  mimeType: string;
  durationMs?: number;
}

export interface TTSProvider {
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}

export interface KnowledgeResult {
  id: string;
  title: string;
  url?: string;
  section?: string;
  content: string;
  score?: number;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  url?: string;
  content: string;
}

export interface KnowledgeProvider {
  search(query: string): Promise<KnowledgeResult[]>;
  read(resourceId: string): Promise<KnowledgeDocument>;
}

export type GovernanceDecisionType = "ALLOW" | "DENY" | "CONSTRAIN" | "REQUIRE_APPROVAL";

export interface GovernanceRequest {
  actor: {
    id: string;
    type: "agent" | "user";
  };
  capability: string;
  resource?: string;
  purpose?: string;
  input?: unknown;
  context?: {
    sessionId?: string;
    userId?: string;
    environment?: string;
  };
}

export interface GovernanceDecision {
  decision: GovernanceDecisionType;
  reasonCode?: string;
  constraints?: Record<string, unknown>;
}

export interface GovernanceProvider {
  evaluate(request: GovernanceRequest): Promise<GovernanceDecision>;
}
