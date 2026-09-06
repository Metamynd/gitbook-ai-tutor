import fs from "node:fs";
import path from "node:path";

// spec §23 — learning paths are data, not application logic. Reads
// whatever content/learning-paths/*.json exists (generated per
// deployment by scripts/generate-curriculum.mjs) rather than importing a
// fixed filename.

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  topics: string[];
}

let cached: LearningPath[] | null = null;

export function getLearningPaths(): LearningPath[] {
  if (!cached) {
    const dir = path.join(process.cwd(), "content/learning-paths");
    cached = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  }
  return cached;
}
