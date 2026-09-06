import fs from "node:fs";
import path from "node:path";
import { tutorConfig } from "../../config/tutor.config";
import type { LLMMessage } from "../providers/types";
import type { KnowledgeResult } from "../providers/types";
import type { LearnerLevel } from "../learning/types";

// spec §16, §25 — assembles the LLM context: system prompt (rendered from
// content/prompts/tutor-system-prompt.md), learner/session context, last N
// turns, and retrieved documentation, in that order. Token efficiency is a
// primary cost requirement (spec §25) — callers control N and how much
// retrieved content is included; this module doesn't fetch anything itself.

let cachedTemplate: string | null = null;
let cachedPedagogicalPrompt: string | null = null;
let cachedLevelGuidance: Record<LearnerLevel, string> | null = null;

function readContentFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

// spec §17 — response depth must actually differ per level, not just be
// mentioned. A generic "adapt to the learner's level" instruction wasn't
// enough to reliably change output; explicit per-level guidance is.
function levelGuidance(level: LearnerLevel): string {
  if (!cachedLevelGuidance) {
    cachedLevelGuidance = JSON.parse(readContentFile("content/prompts/level-guidance.json"));
  }
  return cachedLevelGuidance![level];
}

// Operator-configurable additions (spec: settings-page "Activate
// Pedagogical Tutor" checkbox next to a custom-prompt textarea, spec §61
// governance-style boundary — toggled per deployment, not per user). Both
// layer on top of the base tutor system prompt; the checkbox and the
// custom prompt box are independent and combine together when both are
// set, rather than one replacing the other.
export interface PromptOverrides {
  pedagogicalModeEnabled?: boolean;
  customPrompt?: string;
}

function renderSystemPrompt(overrides?: PromptOverrides): string {
  if (!cachedTemplate) {
    cachedTemplate = readContentFile("content/prompts/tutor-system-prompt.md");
  }

  const base = cachedTemplate
    .replaceAll("{{productName}}", tutorConfig.product)
    .replaceAll("{{tutorName}}", tutorConfig.tutorName);

  const sections = [base];

  if (overrides?.pedagogicalModeEnabled) {
    if (!cachedPedagogicalPrompt) {
      cachedPedagogicalPrompt = readContentFile("content/prompts/pedagogical-tutor.md");
    }
    sections.push(`## Pedagogical Tutor mode (Socratic)\n\n${cachedPedagogicalPrompt}`);
  }

  if (overrides?.customPrompt?.trim()) {
    sections.push(`## Additional operator instructions\n\n${overrides.customPrompt.trim()}`);
  }

  return sections.join("\n\n---\n\n");
}

// spec §14 — normalized MCP results injected as data, wrapped so the LLM
// treats them as reference material rather than instructions (spec §37).
function renderDocumentationBlock(sources: KnowledgeResult[]): string {
  if (sources.length === 0) return "";

  const rendered = sources
    .map(
      (s, i) =>
        `SOURCE ${i + 1}\nTitle: ${s.title}${s.section ? `\nSection: ${s.section}` : ""}${
          s.url ? `\nURL: ${s.url}` : ""
        }\n\n${s.content}`
    )
    .join("\n\n");

  return `<retrieved_documentation>\n\n${rendered}\n\n</retrieved_documentation>`;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface BuildContextParams extends PromptOverrides {
  learnerLevel?: LearnerLevel | null;
  sessionSummary?: string | null;
  recentTurns: ConversationTurn[];
  sources: KnowledgeResult[];
  userMessage: string;
}

export function buildTutorContext(params: BuildContextParams): LLMMessage[] {
  const messages: LLMMessage[] = [
    {
      role: "system",
      content: renderSystemPrompt({
        pedagogicalModeEnabled: params.pedagogicalModeEnabled,
        customPrompt: params.customPrompt,
      }),
    },
  ];

  const contextLines: string[] = [];
  if (params.learnerLevel) contextLines.push(levelGuidance(params.learnerLevel));
  if (params.sessionSummary) contextLines.push(`Session summary so far: ${params.sessionSummary}`);
  const docsBlock = renderDocumentationBlock(params.sources);
  if (docsBlock) contextLines.push(docsBlock);

  if (contextLines.length > 0) {
    messages.push({ role: "system", content: contextLines.join("\n\n") });
  }

  for (const turn of params.recentTurns) {
    messages.push({ role: turn.role, content: turn.content });
  }

  messages.push({ role: "user", content: params.userMessage });

  return messages;
}
