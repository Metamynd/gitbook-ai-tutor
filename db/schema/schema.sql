-- Tutor schema (spec §31, §32). Applied with `npm run db:push`.
--
-- Decision: no login in v1 — every session is a guest session. There is no
-- `users` table with credentials; `learners` is keyed by a client-generated
-- anonymous id (UUID persisted in localStorage) so progress can still
-- persist across visits on the same browser without an account.

create extension if not exists "pgcrypto";

create table if not exists learners (
  id uuid primary key default gen_random_uuid(),
  anonymous_id uuid not null unique,
  overall_level text not null default 'beginner'
    check (overall_level in ('beginner', 'intermediate', 'developer', 'advanced')),
  goals jsonb not null default '[]',
  completed_lessons jsonb not null default '[]',
  current_learning_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid references learners(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  current_topic text,
  current_lesson text,
  conversation_summary text,
  mode text not null default 'free_chat'
    check (mode in ('free_chat', 'lesson', 'quiz', 'guided_path')),
  voice_enabled boolean not null default false
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tutor_sessions(id) on delete cascade,
  learner_id uuid references learners(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  input_mode text not null default 'text' check (input_mode in ('text', 'voice')),
  content text not null,
  raw_transcript text,
  normalized_transcript text,
  sources_json jsonb,
  token_input integer,
  token_output integer,
  llm_provider text,
  llm_model text,
  created_at timestamptz not null default now()
);

create table if not exists topic_mastery (
  learner_id uuid not null references learners(id) on delete cascade,
  topic_id text not null,
  mastery numeric not null default 0 check (mastery >= 0 and mastery <= 1),
  confidence numeric not null default 0,
  last_reviewed_at timestamptz,
  attempts integer not null default 0,
  correct_answers integer not null default 0,
  primary key (learner_id, topic_id)
);

create table if not exists misconceptions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  topic_id text not null,
  description text not null,
  identified_at timestamptz not null default now(),
  resolved boolean not null default false
);

create table if not exists learning_paths (
  id text primary key,
  title text not null,
  description text,
  topics jsonb not null
);

create table if not exists lesson_progress (
  learner_id uuid not null references learners(id) on delete cascade,
  learning_path_id text not null references learning_paths(id) on delete cascade,
  topic_id text not null,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  updated_at timestamptz not null default now(),
  primary key (learner_id, learning_path_id, topic_id)
);

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid references learners(id) on delete set null,
  session_id uuid references tutor_sessions(id) on delete set null,
  question_id text not null,
  topic_id text not null,
  answer text,
  score numeric,
  correct boolean,
  feedback text,
  created_at timestamptz not null default now()
);

create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references tutor_sessions(id) on delete set null,
  learner_id uuid references learners(id) on delete set null,
  provider text not null,
  model text not null,
  capability text not null check (capability in ('llm', 'stt', 'tts')),
  input_tokens integer,
  output_tokens integer,
  audio_seconds numeric,
  characters integer,
  estimated_cost_usd numeric,
  latency_ms integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_session on messages(session_id);
create index if not exists idx_tutor_sessions_learner on tutor_sessions(learner_id);
create index if not exists idx_usage_events_session on usage_events(session_id);
create index if not exists idx_quiz_attempts_learner on quiz_attempts(learner_id);

-- spec §25 — marks how far conversation_summary already covers, so
-- re-summarizing only processes turns folded in since last time instead of
-- reprocessing the whole session every time the threshold trips.
alter table tutor_sessions add column if not exists summarized_through timestamptz;

-- Single-row global tutor settings (this deployment is single-tenant, spec
-- §60 — no per-user or per-tenant settings needed). Lets an operator
-- toggle the built-in Pedagogical (Socratic) tutor mode and add a custom
-- prompt, both folded into the system prompt at request time — see
-- tutor-core/conversation/context.ts.
create table if not exists tutor_settings (
  id text primary key default 'default',
  custom_prompt text not null default '',
  pedagogical_mode_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Phase 4 (spec §17/§18) — overall_level must distinguish "never chosen"
-- from "explicitly beginner" so the UI knows when to ask. NOT NULL DEFAULT
-- 'beginner' from Phase 1 couldn't express that; new learners now start
-- null and get prompted once.
alter table learners alter column overall_level drop not null;
alter table learners alter column overall_level drop default;

-- spec §61 — governance evidence: "record decision-level evidence rather
-- than token-level noise." One row per governance check (not one per
-- token/request), capturing what was asked and what was decided. Backed
-- today by PassthroughGovernanceProvider (always ALLOW) — this table is
-- what lets a real GovernanceProvider slot in later without
-- touching call sites: they already all log through here.
create table if not exists governance_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references tutor_sessions(id) on delete set null,
  learner_id uuid references learners(id) on delete set null,
  actor_id text not null,
  capability text not null,
  resource text,
  decision text not null check (decision in ('ALLOW', 'DENY', 'CONSTRAIN', 'REQUIRE_APPROVAL')),
  reason_code text,
  created_at timestamptz not null default now()
);
create index if not exists idx_governance_events_created on governance_events(created_at desc);
