import type { LearnerLevel } from "./types";

// A learner picks a level once during onboarding (app/api/learner/level),
// but can restate it mid-conversation ("actually I'm a beginner", "I'm
// more advanced than that") without ever touching that UI again. Without
// detecting this in chat, the stored level never updates and the
// level-guidance.json injection keeps using the stale onboarding choice,
// leaving the system prompt's generic "adapt explanation depth" behaviour
// to fight a hard-coded depth instruction it can't override.
//
// Deliberately conservative: requires first-person self-identification
// phrasing ("I'm a beginner", "treat me like a developer"), not just any
// mention of a level word, so it doesn't misfire on sentences like "this
// API is meant for advanced users."

const LEVEL_PATTERNS: { level: LearnerLevel; pattern: RegExp }[] = [
  {
    level: "beginner",
    pattern: /\b(i'?m|i am|treat me like|call me)\s+(a |an )?(total |complete |absolute )?beginner\b/i,
  },
  {
    level: "beginner",
    pattern: /\bi'?m (totally |completely |brand )?new to (this|it|programming|coding)\b/i,
  },
  { level: "intermediate", pattern: /\b(i'?m|i am|treat me like|call me)\s+(an? )?intermediate\b/i },
  { level: "developer", pattern: /\b(i'?m|i am|treat me like|call me)\s+(a |an )?developer\b/i },
  {
    level: "advanced",
    pattern: /\b(i'?m|i am|treat me like|call me)\s+(a |an )?(quite |very |pretty )?advanced\b/i,
  },
];

export function detectStatedLevel(message: string): LearnerLevel | null {
  for (const { level, pattern } of LEVEL_PATTERNS) {
    if (pattern.test(message)) return level;
  }
  return null;
}
