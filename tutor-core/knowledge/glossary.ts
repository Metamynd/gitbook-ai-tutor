import type { KnowledgeProvider, KnowledgeResult } from "../providers/types";
import { tutorConfig } from "../../config/tutor.config";

// A compact glossary/definitions page consistently loses to long-form
// architecture pages in GitBook's own search ranking for natural-language
// questions. Confirmed live against a real deployment: searching a bare
// acronym surfaced the Glossary page, but the actual question that needed
// it (a longer, natural-language question that never contained the
// acronym itself) did not, and GitBook's search API takes only a bare
// query string — no way to ask for more results or influence ranking.
// The model then guessed a wrong expansion instead of admitting the
// retrieved excerpts didn't cover it — even after a grounding-rule
// instruction told it not to. A prompt rule alone wasn't enough there.
//
// Rather than trying to out-guess GitBook's ranking, always include a
// configured glossary page directly, so a correct definition doesn't
// depend on search ranking's luck. Optional (GITBOOK_GLOSSARY_URL) —
// most GitBook sites won't have a dedicated glossary page.

let cached: KnowledgeResult | null | undefined;

export async function getGlossaryResult(knowledgeProvider: KnowledgeProvider): Promise<KnowledgeResult | null> {
  if (!tutorConfig.knowledge.glossaryUrl) return null;
  if (cached !== undefined) return cached;

  try {
    const doc = await knowledgeProvider.read(tutorConfig.knowledge.glossaryUrl);
    cached = { id: doc.id, title: doc.title, url: doc.url, content: doc.content, section: "Glossary" };
  } catch {
    // Fail open — a missing/unreachable glossary page shouldn't affect
    // any other question. Leave `cached` unset so a transient fetch
    // failure gets retried on the next question instead of permanently
    // disabling this for the rest of the process's lifetime.
    return null;
  }
  return cached;
}
