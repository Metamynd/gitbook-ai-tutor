# Agent instructions: customizing this template

This file is for a coding agent (Claude Code, Cursor, etc.) tasked with
turning this generic GitBook-AI-tutor template into a tutor for one
specific product. A human can follow it too, but it's written as an
ordered checklist with exact file paths and verification commands so an
agent can execute it without back-and-forth.

Read [README.md](README.md) first for the overall architecture — this
file only covers the *customization* steps.

## Inputs you need before starting

Ask the user (or find in their instructions) for:

1. The product name and tutor name (e.g. product "Acme", tutor "Acme Tutor").
2. The GitBook docs domain (e.g. `docs.acme.com` — the MCP endpoint will be
   `https://docs.acme.com/~gitbook/mcp`).
3. An OpenRouter API key (or confirmation the user will supply one) —
   required for chat, quiz generation, and curriculum generation.
4. A Postgres connection string (or confirmation to use the local Docker
   throwaway instance from README.md).
5. Brand colors (hex values) and, optionally, a logo, if the user wants
   custom branding beyond the default palette.

If any of these are missing and the task can't proceed without them, ask —
don't invent a product name or a fake docs domain.

## Step-by-step

### 1. Install and verify the GitBook MCP endpoint

```bash
npm install
cp .env.example .env
```

Set `GITBOOK_MCP_URL=https://<their-docs-domain>/~gitbook/mcp` in `.env`,
then verify it's actually live before doing anything else:

```bash
node --env-file=.env scripts/probe-gitbook-mcp.mjs
```

If this fails, stop and tell the user — every other step depends on a
working knowledge source. Common cause: the docs domain isn't actually a
published GitBook site, or it's a custom domain that hasn't finished
propagating.

### 2. Set product identity

Edit `.env`:

```
TUTOR_PRODUCT_NAME=<their product name>
TUTOR_NAME=<their tutor name, e.g. "<Product> Tutor">
```

These are read by [config/tutor.config.ts](config/tutor.config.ts) and
flow into the system prompts
([content/prompts/tutor-system-prompt.md](content/prompts/tutor-system-prompt.md),
[content/prompts/pedagogical-tutor.md](content/prompts/pedagogical-tutor.md))
via `{{productName}}`/`{{tutorName}}` template substitution. Do not
hard-code the product name anywhere else in code — grep for it after
you're done to make sure you didn't:

```bash
git grep -il "<their product name>" -- ':!content' ':!.env*'
```

Anything that matches outside of generated `content/` or env files is a
bug — the whole point of this template is that product identity lives in
config, not code.

### 3. Set up the database

```bash
npm run db:push
```

This applies [db/schema/schema.sql](db/schema/schema.sql), which is
idempotent (`create table if not exists`) — safe to re-run.

### 4. Generate the curriculum

```bash
npm run generate:curriculum
```

This samples real pages from their GitBook (via
`CURRICULUM_GENERATOR_SEED_QUERIES` in `.env`, defaults are generic:
"overview, getting started, architecture, core concepts, quickstart") and
asks the LLM to propose a topic taxonomy, writing:

- `content/curriculum/topics.json`
- `content/curriculum/relationships.json`
- `content/vocabulary/terms.json`
- one file under `content/learning-paths/`

**Read the generated `topics.json` before moving on.** If the seed queries
don't match how their docs are structured (e.g. their GitBook uses
different section names), adjust `CURRICULUM_GENERATOR_SEED_QUERIES` and
regenerate. This step produces data, not code — there's no "wrong" way to
run it, but a bad taxonomy will make the knowledge classifier
(`tutor-core/knowledge/classify.ts`) less accurate, so don't skip
reviewing it.

### 5. Rebrand the UI

Two files carry all the visual branding:

- **[tailwind.config.js](tailwind.config.js)** — the `colors.brand`
  object (`ink`, `soft`, `slate`) and the `backgroundImage` entries
  (`gradient-brand-primary`, `gradient-brand-soft`, `gradient-brand-dark`).
  Replace the hex values with the user's brand colors. Don't rename the
  token keys (`brand-ink`, `bg-brand-soft`, etc.) — they're referenced by
  class name throughout `app/`; renaming them means updating every call
  site for no benefit.
- **[app/components/brand-header.tsx](app/components/brand-header.tsx)** —
  an inline SVG logo mark plus the tutor name text. Either edit the SVG
  paths/gradient stops directly, or replace it with an `<img>`/`next/image`
  pointing at a real logo file the user supplies (drop it in
  `public/brand/` and reference it from there — don't inline a large
  raster asset as a data URI).

After editing, do a quick visual check — `npm run dev`, load `/`, confirm
the header renders with the new colors/logo and no leftover default-purple
gradient is visible anywhere unintended (check `/admin` and `/progress`
too, they use the same tokens).

### 6. Optional: governance

The default [`PassthroughGovernanceProvider`](providers/governance/passthrough.ts)
always returns ALLOW and logs to `governance_events`. Leave it as-is unless
the user explicitly asks for real policy enforcement. If they do, implement
the `GovernanceProvider` interface from
[tutor-core/providers/types.ts](tutor-core/providers/types.ts) as a new
file under `providers/governance/`, and point `GOVERNANCE_PROVIDER` in
`.env` at it. Every capability-gated call site already routes through
`app/api/_lib/governance.ts` — you should not need to touch call sites,
only add a new provider implementation.

### 7. Optional: voice

Only do this if the user asks for voice. Set `ELEVENLABS_API_KEY` and
`ELEVENLABS_VOICE_ID` for TTS; `STT_PROVIDER`/`STT_MODEL` for speech-to-text
(OpenRouter-based ASR). Both providers already exist
([providers/tts/elevenlabs.ts](providers/tts/elevenlabs.ts),
[providers/stt/openrouter-asr.ts](providers/stt/openrouter-asr.ts)) — this
is config only, not new code, unless the user wants a different TTS/STT
vendor, in which case implement `TTSProvider`/`STTProvider` from
`tutor-core/providers/types.ts`.

### 8. Verify before handing back

```bash
npm run typecheck
npm run build
npm run dev
```

Then manually exercise, in the browser:

- Ask a question you know is answered in their docs — confirm the answer
  is grounded (cites/reflects real doc content, not a generic LLM answer).
- Ask something plausible-sounding but false about the product (a
  hallucination probe, e.g. "does this have a 99.99% SLA?" if that's not
  true) — confirm the tutor says it doesn't know rather than confabulating.
- Take a generated quiz question end-to-end.
- Check `/admin` renders the governance log and settings panel.
- Check `/progress` renders without errors for a fresh guest session.

Report back to the user what you changed (env vars, generated content,
rebranded files) and any curriculum taxonomy decisions worth their review.

## Things not to do

- Don't add a multi-tenant abstraction (`tenant_id`, tenant routing, etc.)
  to serve multiple products from one deployment. This template is
  single-tenant by design — a second product is a second deployment
  (separate `.env` + separate generated `content/`), not a runtime switch.
- Don't hand-author `content/curriculum/*.json` from scratch when the
  generator is available and working — regenerate instead, even if it
  means re-reviewing the output.
- Don't remove the knowledge-requirement classification step
  (`tutor-core/knowledge/classify.ts`) to "simplify" retrieval — it exists
  specifically to avoid an extra LLM round-trip on every message, and a
  prior version of this exact heuristic had a hard-coded product-name bug
  that silently produced hallucinated answers. If you change it, test both
  a docs-requiring question and a small-talk question afterward.
- Don't check in a real `.env` or `.env.production` file, ever — only the
  `.example` variants belong in git.
