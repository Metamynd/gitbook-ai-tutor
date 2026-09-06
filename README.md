# GitBook AI Tutor

An adaptive AI tutor you can point at **any GitBook-hosted documentation
site** and deploy as your own product's tutor. Guest chat grounded in live
GitBook retrieval, learner levels with genuinely different response depth,
a quiz engine with mastery tracking, and a pluggable governance boundary —
all driven by environment variables and generated content, not hard-coded
to any one product.

This repo started as the tutor for one specific product, then was
generalized into a reusable template. Nothing in the code is specific to
that original product; retargeting it to yours is a `.env` change plus
regenerating `content/` (see [Customizing this for your product](#customizing-this-for-your-product)) — not a code change.

MIT licensed — use it, fork it, sell it, whatever you like.

## What it does

- **Grounded chat.** Every answer is checked against your GitBook docs via
  GitBook's own MCP integration (`<your-docs-domain>/~gitbook/mcp`) before
  the model responds, so the tutor answers from your actual documentation
  instead of guessing.
- **Adaptive learner levels.** Learners are tracked at a level (beginner /
  intermediate / advanced) that genuinely changes response depth and
  vocabulary — not just a cosmetic label.
- **Quiz engine with mastery tracking.** Quizzes are generated and graded
  by the LLM against real doc content, and a learner's mastery of each
  topic only updates when there's actual evidence (a quiz answer or an
  explicit self-assessment), not on every chat turn.
- **Session summarization.** Long conversations get folded into a running
  summary once a configurable turn/token threshold trips, so context stays
  bounded without losing earlier grounding.
- **Governance boundary.** Every LLM call, doc search, and learner
  progress read/write is routed through a `GovernanceProvider.evaluate()`
  gate before it runs. The bundled provider is a passthrough (always
  ALLOW) that logs every decision to a `governance_events` table, visible
  in `/admin` — swap in a real policy engine without touching call sites.
- **Guest-only sessions.** No login required. Sessions are identified by a
  client-generated anonymous id; there's no auth system to configure.
- **Pedagogical (Socratic) mode.** An optional toggle (set in `/admin`)
  switches the tutor from "just answer the question" to guiding the
  learner to the answer with questions — with its own separate system
  prompt.
- **Voice (optional, stubbed by default).** STT/TTS provider interfaces
  exist (OpenRouter ASR, ElevenLabs) but are not required — text chat works
  with zero voice configuration.

## Architecture

The code is split into three layers so swapping any one piece (the LLM,
the knowledge source, the governance policy) never touches the others:

```
/app                 Next.js App Router — UI pages + API routes
/tutor-core          Provider-agnostic core logic: conversation
                     orchestration, learning/mastery, quiz generation
                     and evaluation, knowledge-requirement classification,
                     governance types
/providers           Concrete implementations of tutor-core's interfaces
                     (OpenRouter for LLM, GitBook MCP for knowledge,
                     ElevenLabs for TTS, a passthrough governance provider)
/config              tutor.config.ts — every env-driven knob in one place
/content             Data, not code: curriculum, vocabulary, learning
                     paths, and system prompts. curriculum/vocabulary/
                     learning-paths are generated per deployment
                     (see below); prompts are hand-written templates.
/db                  db/schema/schema.sql (idempotent, plain SQL) +
                     repositories.ts (plain `pg`, no ORM)
/scripts             db:push, generate:curriculum, probe-gitbook-mcp,
                     deploy smoke test
/evals               A small illustrative eval question set
                     (functional + hallucination probes)
```

`tutor-core` only ever depends on the interfaces in
[`tutor-core/providers/types.ts`](tutor-core/providers/types.ts)
(`LLMProvider`, `KnowledgeProvider`, `TTSProvider`, `STTProvider`,
`GovernanceProvider`) — never directly on OpenRouter, ElevenLabs, or
GitBook. To use a different LLM or knowledge source, write a new provider
that satisfies the interface and point `config/tutor.config.ts` at it;
nothing in `tutor-core` or `app/` needs to change.

### Request flow (chat)

1. `app/api/tutor/stream/route.ts` receives a message for a session.
2. `tutor-core/knowledge/classify.ts` decides — with a keyword/taxonomy
   heuristic, not an extra LLM round-trip — whether this message needs a
   docs lookup at all.
3. If it does, the configured `KnowledgeProvider`
   ([providers/knowledge/gitbook-mcp.ts](providers/knowledge/gitbook-mcp.ts))
   calls GitBook's MCP `searchDocumentation`/`getPage` tools.
4. `tutor-core/conversation/orchestrator.ts` assembles the system prompt
   (learner level, pedagogical mode, retrieved doc context, running
   summary) and streams the LLM response back as newline-delimited JSON.
5. Every step that touches the LLM, docs, or learner data first goes
   through `GovernanceProvider.evaluate()` — see `app/api/_lib/governance.ts`.

## Getting started

Prerequisites: Node 20+, a Postgres database (local Docker is fine — see
below), and an [OpenRouter](https://openrouter.ai) API key.

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` — your Postgres connection string
- `OPENROUTER_API_KEY` — for chat, quiz generation/grading, and the
  curriculum generator
- `GITBOOK_MCP_URL` — your own GitBook space's docs domain, e.g.
  `https://docs.your-product.com/~gitbook/mcp` (GitBook exposes this
  automatically on every published GitBook site — no setup needed on the
  GitBook side)
- `TUTOR_PRODUCT_NAME` / `TUTOR_NAME` — what the tutor calls itself and the
  product it teaches

Then:

```bash
npm run db:push              # applies db/schema/schema.sql (idempotent)
npm run generate:curriculum  # bootstraps content/ from your GitBook
npm run dev
```

The app serves at `http://localhost:3000`.

For a throwaway local Postgres:

```bash
docker run -d --name gitbook-tutor-pg \
  -e POSTGRES_USER=tutor -e POSTGRES_PASSWORD=tutor -e POSTGRES_DB=tutor \
  -p 15433:5432 postgres:17.5-alpine
```

(and set `DATABASE_URL=postgres://tutor:tutor@localhost:15433/tutor`).

## Customizing this for your product

This is the part you'll actually do. All of it is `.env` + generated
content — see [AGENTS.md](AGENTS.md) if you're doing this with a coding
agent, it walks through the same steps with exact file paths and verification
commands.

1. **Point at your GitBook.** Set `GITBOOK_MCP_URL` to
   `https://<your-docs-domain>/~gitbook/mcp`. Any published GitBook site
   exposes this — verify it with `npm run probe:gitbook-mcp`.
2. **Set your product identity.** `TUTOR_PRODUCT_NAME` and `TUTOR_NAME` in
   `.env` — these flow into the system prompts via `{{productName}}` /
   `{{tutorName}}` templates in
   [content/prompts/tutor-system-prompt.md](content/prompts/tutor-system-prompt.md)
   and [content/prompts/pedagogical-tutor.md](content/prompts/pedagogical-tutor.md).
3. **Generate your curriculum.** `npm run generate:curriculum` samples real
   pages from your GitBook via seed queries
   (`CURRICULUM_GENERATOR_SEED_QUERIES`) and asks the LLM to propose a
   topic taxonomy, writing `content/curriculum/topics.json`,
   `content/curriculum/relationships.json`, `content/vocabulary/terms.json`,
   and one `content/learning-paths/*.json` file. **Review the generated
   taxonomy before trusting it** — it's a starting point, not
   ground truth.
4. **Rebrand the UI.** Colors/gradients live in `tailwind.config.js` under
   the `brand` color group and `gradient-brand-*` background images; the
   header mark is the inline SVG in
   [app/components/brand-header.tsx](app/components/brand-header.tsx).
   Replace both with your own palette/logo.
5. **(Optional) Governance.** The bundled
   [`PassthroughGovernanceProvider`](providers/governance/passthrough.ts)
   always allows and just logs. If you have a real policy engine, implement
   `GovernanceProvider` from
   [tutor-core/providers/types.ts](tutor-core/providers/types.ts) and point
   `GOVERNANCE_PROVIDER` at it.
6. **(Optional) Voice.** Set `ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID` for
   TTS. STT uses `STT_PROVIDER`/`STT_MODEL` via OpenRouter. Both are
   optional — the app works as pure text chat without them.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for a full guide, including a
GitHub Actions Docker deploy workflow and the specific nginx directives
(`proxy_buffering off`, `client_max_body_size`) a streaming chat app needs
behind a reverse proxy. Docker/SSH deployment is one option — this is a
standard Next.js app and deploys fine to Vercel, Railway, Fly.io, or
anywhere else that runs Node.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS ·
PostgreSQL via plain `pg` (no ORM) · OpenRouter for LLM calls · GitBook's
built-in MCP integration for retrieval.

## License

MIT — see [LICENSE](LICENSE).
