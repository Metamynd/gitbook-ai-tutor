// Product identity and knowledge source are env-driven rather than
// hard-coded — the code stays generic across any GitBook-hosted docs
// site. Point this at your own product by setting the env vars below and
// regenerating content/ (see README) — no code changes needed.

export type SessionSummaryStrategy = "turns" | "tokens" | "hybrid";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const tutorConfig = {
  product: process.env.TUTOR_PRODUCT_NAME ?? "Your Product",
  tutorName: process.env.TUTOR_NAME ?? "Your Product Tutor",

  knowledge: {
    provider: "gitbook-mcp",
    endpoint: process.env.GITBOOK_MCP_URL ?? "",
    // Optional: a dedicated glossary/definitions page, always included
    // alongside whatever the per-question search returns (see
    // tutor-core/knowledge/glossary.ts for why — a compact definitions
    // page reliably loses to long-form pages in GitBook's own search
    // ranking for natural-language questions). Most GitBook sites won't
    // have one; leave unset and this does nothing.
    glossaryUrl: process.env.GITBOOK_GLOSSARY_URL ?? "",
  },

  llm: {
    provider: process.env.LLM_PROVIDER ?? "openrouter",
    model: process.env.LLM_MODEL ?? "",
  },

  governance: {
    // "passthrough" (always ALLOW) until you wire in a real governance
    // provider — see tutor-core/providers/types.ts's GovernanceProvider.
    provider: process.env.GOVERNANCE_PROVIDER ?? "passthrough",
  },

  // spec §24/§25 — decision: no login in v1, so every session is a guest
  // session identified by a client-generated anonymous id (see db/schema).
  auth: {
    guestOnly: true,
  },

  // spec §25 — "periodically summarize older turns" needed a concrete,
  // configurable trigger. "hybrid" (either threshold trips it) is the
  // default; pick "turns" for predictable UX or "tokens" for tighter cost
  // control on verbose conversations.
  sessionSummary: {
    strategy: (process.env.SESSION_SUMMARY_STRATEGY as SessionSummaryStrategy) ?? "hybrid",
    triggerTurns: envInt("SESSION_SUMMARY_TRIGGER_TURNS", 10),
    triggerTokens: envInt("SESSION_SUMMARY_TRIGGER_TOKENS", 3000),
  },

  curriculum: "./content/curriculum",

  // Bootstraps content/curriculum, content/vocabulary, and
  // content/learning-paths for whichever GitBook this deployment points
  // at, via `npm run generate:curriculum` (scripts/generate-curriculum.mjs).
  // Hand-authoring a topic taxonomy per deployment doesn't scale across
  // "any GitBook" — instead sample real docs content and have the LLM
  // propose the taxonomy, then review before committing it.
  curriculumGenerator: {
    seedQueries: (process.env.CURRICULUM_GENERATOR_SEED_QUERIES ??
      "overview,getting started,architecture,core concepts,quickstart")
      .split(",")
      .map((q) => q.trim())
      .filter(Boolean),
    maxPages: envInt("CURRICULUM_GENERATOR_MAX_PAGES", 15),
    model: process.env.CURRICULUM_GENERATOR_MODEL ?? process.env.LLM_MODEL ?? "",
  },
} as const;

export type TutorConfig = typeof tutorConfig;

export function shouldSummarizeSession(turnsSinceSummary: number, tokensSinceSummary: number): boolean {
  const { strategy, triggerTurns, triggerTokens } = tutorConfig.sessionSummary;

  switch (strategy) {
    case "turns":
      return turnsSinceSummary >= triggerTurns;
    case "tokens":
      return tokensSinceSummary >= triggerTokens;
    case "hybrid":
    default:
      return turnsSinceSummary >= triggerTurns || tokensSinceSummary >= triggerTokens;
  }
}
