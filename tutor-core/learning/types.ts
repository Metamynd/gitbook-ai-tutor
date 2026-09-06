// spec §18 — persistent learner profile.

export type LearnerLevel = "beginner" | "intermediate" | "developer" | "advanced";

export interface TopicMasteryEntry {
  mastery: number; // 0.0 unknown → 1.0 demonstrated mastery, see spec §18
  confidence: number;
  lastReviewedAt?: string;
  attempts: number;
  correctAnswers: number;
}

export interface Misconception {
  topicId: string;
  description: string;
  identifiedAt: string;
  resolved?: boolean;
}

export interface LearnerState {
  userId: string;
  overallLevel: LearnerLevel;

  goals: string[];

  topics: {
    [topicId: string]: TopicMasteryEntry;
  };

  misconceptions: Misconception[];

  completedLessons: string[];
  currentLearningPath?: string;
}

// spec §20 — output of the (evidence-gated) learner-state update step.
export interface LearnerStateUpdate {
  topicsTouched: string[];
  masteryDelta: Record<string, number>;
  misconceptions: Misconception[];
  suggestedNextTopic?: string;
}
