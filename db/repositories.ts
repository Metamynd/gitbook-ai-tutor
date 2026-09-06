import { getPool } from "./client";
import type { LearnerLevel } from "../tutor-core/learning/types";
import type { Source } from "../tutor-core/conversation/types";

// Thin query functions over the schema in db/schema/schema.sql. Plain SQL,
// no ORM (spec §59) — Phase 1 only needs learners/sessions/messages/usage;
// topic_mastery, quiz_attempts etc. land with Phase 4.

export interface Learner {
  id: string;
  anonymousId: string;
  // null = level not yet chosen (spec §17/§18 — Phase 4 onboarding asks
  // once; distinct from an explicit "beginner" choice).
  overallLevel: LearnerLevel | null;
}

export async function getOrCreateLearner(anonymousId: string): Promise<Learner> {
  const { rows } = await getPool().query(
    `insert into learners (anonymous_id)
     values ($1)
     on conflict (anonymous_id) do update set updated_at = now()
     returning id, anonymous_id, overall_level`,
    [anonymousId]
  );
  const row = rows[0];
  return { id: row.id, anonymousId: row.anonymous_id, overallLevel: row.overall_level };
}

export interface DbTutorSession {
  id: string;
  learnerId: string | null;
  startedAt: string;
  conversationSummary: string | null;
  summarizedThrough: string | null;
  mode: "free_chat" | "lesson" | "quiz" | "guided_path";
  voiceEnabled: boolean;
}

const SESSION_COLUMNS = "id, learner_id, started_at, conversation_summary, summarized_through, mode, voice_enabled";

export async function createSession(learnerId: string | null): Promise<DbTutorSession> {
  const { rows } = await getPool().query(
    `insert into tutor_sessions (learner_id) values ($1) returning ${SESSION_COLUMNS}`,
    [learnerId]
  );
  return mapSession(rows[0]);
}

export async function getSession(id: string): Promise<DbTutorSession | null> {
  const { rows } = await getPool().query(
    `select ${SESSION_COLUMNS} from tutor_sessions where id = $1`,
    [id]
  );
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function updateSessionSummary(
  id: string,
  summary: string,
  summarizedThrough: string
): Promise<void> {
  await getPool().query(
    `update tutor_sessions set conversation_summary = $2, summarized_through = $3 where id = $1`,
    [id, summary, summarizedThrough]
  );
}

function mapSession(row: any): DbTutorSession {
  return {
    id: row.id,
    learnerId: row.learner_id,
    startedAt: row.started_at,
    conversationSummary: row.conversation_summary,
    summarizedThrough: row.summarized_through,
    mode: row.mode,
    voiceEnabled: row.voice_enabled,
  };
}

export interface DbMessage {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export async function appendMessage(params: {
  sessionId: string;
  learnerId: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  sourcesJson?: Source[];
  tokenInput?: number;
  tokenOutput?: number;
  llmProvider?: string;
  llmModel?: string;
}): Promise<void> {
  await getPool().query(
    `insert into messages
       (session_id, learner_id, role, content, sources_json, token_input, token_output, llm_provider, llm_model)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.sessionId,
      params.learnerId,
      params.role,
      params.content,
      params.sourcesJson ? JSON.stringify(params.sourcesJson) : null,
      params.tokenInput ?? null,
      params.tokenOutput ?? null,
      params.llmProvider ?? null,
      params.llmModel ?? null,
    ]
  );
}

export async function getRecentMessages(sessionId: string, limit: number): Promise<DbMessage[]> {
  const { rows } = await getPool().query(
    `select role, content, created_at from messages
     where session_id = $1
     order by created_at desc
     limit $2`,
    [sessionId, limit]
  );
  return rows.reverse().map((r) => ({ role: r.role, content: r.content, createdAt: r.created_at }));
}

// spec §25 — turns eligible to fold into the session summary: everything
// since the last fold, minus the most recent `keepLastN` (which stay as
// raw context via getRecentMessages). Bounded so re-summarizing only ever
// processes what's new, not the whole session each time.
export async function getMessagesToFold(
  sessionId: string,
  sinceSummarizedThrough: string | null,
  keepLastN: number
): Promise<(DbMessage & { role: "user" | "assistant" })[]> {
  const { rows } = await getPool().query(
    `select role, content, created_at from messages
     where session_id = $1 and role in ('user', 'assistant')
       and ($2::timestamptz is null or created_at > $2)
     order by created_at asc`,
    [sessionId, sinceSummarizedThrough]
  );
  const all = rows.map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
    createdAt: r.created_at,
  }));
  return all.length > keepLastN ? all.slice(0, all.length - keepLastN) : [];
}

export async function recordUsage(params: {
  sessionId?: string;
  learnerId?: string | null;
  provider: string;
  model: string;
  capability: "llm" | "stt" | "tts";
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  estimatedCostUsd?: number;
}): Promise<void> {
  await getPool().query(
    `insert into usage_events
       (session_id, learner_id, provider, model, capability, input_tokens, output_tokens, latency_ms, estimated_cost_usd)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.sessionId ?? null,
      params.learnerId ?? null,
      params.provider,
      params.model,
      params.capability,
      params.inputTokens ?? null,
      params.outputTokens ?? null,
      params.latencyMs,
      params.estimatedCostUsd ?? null,
    ]
  );
}

export interface TutorSettings {
  customPrompt: string;
  pedagogicalModeEnabled: boolean;
}

const DEFAULT_SETTINGS: TutorSettings = { customPrompt: "", pedagogicalModeEnabled: false };

export async function getSettings(): Promise<TutorSettings> {
  const { rows } = await getPool().query(
    `select custom_prompt, pedagogical_mode_enabled from tutor_settings where id = 'default'`
  );
  if (!rows[0]) return DEFAULT_SETTINGS;
  return { customPrompt: rows[0].custom_prompt, pedagogicalModeEnabled: rows[0].pedagogical_mode_enabled };
}

export async function updateSettings(settings: TutorSettings): Promise<void> {
  await getPool().query(
    `insert into tutor_settings (id, custom_prompt, pedagogical_mode_enabled, updated_at)
     values ('default', $1, $2, now())
     on conflict (id) do update set
       custom_prompt = excluded.custom_prompt,
       pedagogical_mode_enabled = excluded.pedagogical_mode_enabled,
       updated_at = now()`,
    [settings.customPrompt, settings.pedagogicalModeEnabled]
  );
}
