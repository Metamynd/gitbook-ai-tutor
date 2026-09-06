// Bootstraps content/curriculum/{topics,relationships}.json,
// content/vocabulary/terms.json, and one content/learning-paths/*.json
// file by sampling the configured GitBook's real documentation and asking
// the LLM to propose a taxonomy — instead of hand-authoring one per
// deployment, which doesn't scale across "any GitBook" (spec decision:
// code/config generic across GitBook sites, see config/tutor.config.ts).
//
// Usage: npm run generate:curriculum
//
// Review the generated files before trusting them — this is a bootstrap,
// not a substitute for someone who knows the product checking topic names
// and dependency edges make sense.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const GITBOOK_MCP_URL = process.env.GITBOOK_MCP_URL;
const GITBOOK_MCP_API_KEY = process.env.GITBOOK_MCP_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.CURRICULUM_GENERATOR_MODEL || process.env.LLM_MODEL;
const PRODUCT_NAME = process.env.TUTOR_PRODUCT_NAME || "the product";
const SEED_QUERIES = (
  process.env.CURRICULUM_GENERATOR_SEED_QUERIES ||
  "overview,getting started,architecture,core concepts,quickstart"
)
  .split(",")
  .map((q) => q.trim())
  .filter(Boolean);
const MAX_PAGES = parseInt(process.env.CURRICULUM_GENERATOR_MAX_PAGES || "15", 10);

if (!GITBOOK_MCP_URL) throw new Error("GITBOOK_MCP_URL is not set.");
if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set.");

const CurriculumSchema = z.object({
  topics: z.array(z.object({ id: z.string(), title: z.string() })).min(5).max(25),
  relationships: z.array(
    z.object({
      topic: z.string(),
      requires: z.array(z.string()).default([]),
      recommended: z.array(z.string()).default([]),
    })
  ),
  vocabulary: z.record(z.string(), z.string()).default({}),
  learningPath: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    topics: z.array(z.string()),
  }),
});

async function sampleDocs() {
  const transport = new StreamableHTTPClientTransport(new URL(GITBOOK_MCP_URL), {
    requestInit: GITBOOK_MCP_API_KEY
      ? { headers: { Authorization: `Bearer ${GITBOOK_MCP_API_KEY}` } }
      : undefined,
  });
  const client = new Client({ name: "curriculum-generator", version: "0.1.0" });
  await client.connect(transport);

  const seen = new Map();
  for (const query of SEED_QUERIES) {
    const result = await client.callTool({ name: "searchDocumentation", arguments: { query } });
    for (const block of result.content ?? []) {
      const match = /^Title: (.*)\nLink: (.*)\nContent: ([\s\S]*)$/.exec(block.text ?? "");
      if (!match) continue;
      const [, title, url, content] = match;
      if (!seen.has(url)) seen.set(url, { title, url, content });
    }
  }

  return Array.from(seen.values()).slice(0, MAX_PAGES);
}

async function proposeCurriculum(pages) {
  const excerpts = pages
    .map((p, i) => `[${i + 1}] ${p.title} (${p.url})\n${p.content}`)
    .join("\n\n---\n\n");

  const prompt = `You are bootstrapping the topic taxonomy for an adaptive tutor that teaches "${PRODUCT_NAME}" using the documentation excerpts below.

Produce STRICT JSON (no markdown fences, no commentary) matching exactly this shape:
{
  "topics": [{ "id": "kebab-case-id", "title": "Human Readable Title" }],
  "relationships": [{ "topic": "id", "requires": ["id", ...], "recommended": ["id", ...] }],
  "vocabulary": { "likely speech-to-text mis-transcription": "Canonical Term" },
  "learningPath": { "id": "kebab-case-id", "title": "...", "description": "...", "topics": ["id", ... in learning order] }
}

Rules:
- 10-20 topics covering the concepts that actually appear in the excerpts. Do not invent concepts that aren't grounded in the text.
- Every id in "relationships" and "learningPath.topics" MUST exist in "topics".
- "requires" = hard prerequisites; "recommended" = helpful but not required. Both may be empty arrays.
- "vocabulary" maps terms a speech-to-text engine would plausibly mangle (acronyms, brand names, compound terms) to their canonical spelling. Omit if nothing notable — use {}.
- "learningPath.topics" is a beginner-to-advanced ordering of a sensible subset of the topics.

Documentation excerpts:

${excerpts}`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  const jsonText = raw.replace(/^```(?:json)?\n?/, "").replace(/```$/, "").trim();

  return CurriculumSchema.parse(JSON.parse(jsonText));
}

function pruneToKnownTopics(curriculum) {
  const knownIds = new Set(curriculum.topics.map((t) => t.id));
  const filterIds = (ids) => ids.filter((id) => knownIds.has(id));

  return {
    ...curriculum,
    relationships: curriculum.relationships
      .filter((r) => knownIds.has(r.topic))
      .map((r) => ({ ...r, requires: filterIds(r.requires), recommended: filterIds(r.recommended) })),
    learningPath: { ...curriculum.learningPath, topics: filterIds(curriculum.learningPath.topics) },
  };
}

async function main() {
  console.log(`Sampling ${SEED_QUERIES.length} seed queries from ${GITBOOK_MCP_URL} ...`);
  const pages = await sampleDocs();
  console.log(`Collected ${pages.length} unique pages. Asking ${MODEL} to propose a taxonomy ...`);

  const curriculum = pruneToKnownTopics(await proposeCurriculum(pages));

  const root = path.resolve(import.meta.dirname, "..");
  await mkdir(path.join(root, "content/curriculum"), { recursive: true });
  await mkdir(path.join(root, "content/vocabulary"), { recursive: true });
  await mkdir(path.join(root, "content/learning-paths"), { recursive: true });

  await writeFile(
    path.join(root, "content/curriculum/topics.json"),
    JSON.stringify(curriculum.topics, null, 2) + "\n"
  );
  await writeFile(
    path.join(root, "content/curriculum/relationships.json"),
    JSON.stringify(curriculum.relationships, null, 2) + "\n"
  );
  await writeFile(
    path.join(root, "content/vocabulary/terms.json"),
    JSON.stringify(curriculum.vocabulary, null, 2) + "\n"
  );
  await writeFile(
    path.join(root, `content/learning-paths/${curriculum.learningPath.id}.json`),
    JSON.stringify(curriculum.learningPath, null, 2) + "\n"
  );

  console.log(`\nWrote ${curriculum.topics.length} topics, ${curriculum.relationships.length} relationships,`);
  console.log(`${Object.keys(curriculum.vocabulary).length} vocabulary entries, and learning path "${curriculum.learningPath.id}".`);
  console.log("\nReview content/curriculum, content/vocabulary, and content/learning-paths before relying on this.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
