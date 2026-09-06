import topicsJson from "../../content/curriculum/topics.json";
import relationshipsJson from "../../content/curriculum/relationships.json";
import vocabularyJson from "../../content/vocabulary/terms.json";
import type { TopicKeywords } from "../knowledge/classify";

// spec §19 — topic taxonomy is data, not hard-coded curriculum logic.

export interface Topic {
  id: string;
  title: string;
}

export interface TopicRelationship {
  topic: string;
  requires: string[];
  recommended: string[];
}

export const topics: Topic[] = topicsJson;
export const topicRelationships: TopicRelationship[] = relationshipsJson;

/**
 * Keyword list per topic for the knowledge-requirement heuristic
 * (tutor-core/knowledge/classify.ts): topic id/title words plus any
 * vocabulary-normalization terms that map to a phrase containing the topic.
 */
export function buildTopicKeywords(): TopicKeywords[] {
  const vocabulary = vocabularyJson as Record<string, string>;

  return topics.map((topic) => {
    const idWords = topic.id.replace(/-/g, " ");
    const keywords = new Set<string>([idWords, topic.title.toLowerCase()]);

    for (const canonical of Object.values(vocabulary)) {
      if (canonical.toLowerCase().includes(idWords)) {
        keywords.add(canonical.toLowerCase());
      }
    }

    return { topicId: topic.id, keywords: Array.from(keywords) };
  });
}
