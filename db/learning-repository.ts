import { getPool } from "./client";
import type { LearnerLevel, TopicMasteryEntry, Misconception } from "../tutor-core/learning/types";

// Phase 4 (spec §18/§20/§21/§22) — topic mastery, misconceptions, and quiz
// attempts. Kept separate from repositories.ts (Phase 1 identity/session/
// messaging/usage) since this is a distinct domain added later.

export async function updateLearnerLevel(learnerId: string, level: LearnerLevel): Promise<void> {
  await getPool().query(`update learners set overall_level = $2, updated_at = now() where id = $1`, [
    learnerId,
    level,
  ]);
}

export async function getTopicMastery(learnerId: string): Promise<Record<string, TopicMasteryEntry>> {
  const { rows } = await getPool().query(
    `select topic_id, mastery, confidence, last_reviewed_at, attempts, correct_answers
     from topic_mastery where learner_id = $1`,
    [learnerId]
  );

  const result: Record<string, TopicMasteryEntry> = {};
  for (const r of rows) {
    result[r.topic_id] = {
      mastery: Number(r.mastery),
      confidence: Number(r.confidence),
      lastReviewedAt: r.last_reviewed_at ?? undefined,
      attempts: r.attempts,
      correctAnswers: r.correct_answers,
    };
  }
  return result;
}

// spec §18 mastery scale is 0..1; clamps so repeated deltas can't run
// past the range. `delta` may be negative (e.g. a wrong answer nudging
// mastery down slightly) as well as positive.
export async function applyMasteryDelta(
  learnerId: string,
  topicId: string,
  delta: number,
  correct: boolean
): Promise<void> {
  // Casts on the literal bounds are load-bearing: `least(1, $3)` makes
  // Postgres infer $3 as integer from the untyped literal `1`, which then
  // rejects a fractional delta like 0.15 — caught live when a real quiz
  // submission failed with "invalid input syntax for type integer".
  await getPool().query(
    `insert into topic_mastery (learner_id, topic_id, mastery, confidence, last_reviewed_at, attempts, correct_answers)
     values ($1, $2, greatest(0::numeric, least(1::numeric, $3::numeric)), 0.5, now(), 1, $4)
     on conflict (learner_id, topic_id) do update set
       mastery = greatest(0::numeric, least(1::numeric, topic_mastery.mastery + $3::numeric)),
       confidence = least(1::numeric, topic_mastery.confidence + 0.1),
       last_reviewed_at = now(),
       attempts = topic_mastery.attempts + 1,
       correct_answers = topic_mastery.correct_answers + $4`,
    [learnerId, topicId, delta, correct ? 1 : 0]
  );
}

export async function recordMisconception(
  learnerId: string,
  topicId: string,
  description: string
): Promise<void> {
  await getPool().query(`insert into misconceptions (learner_id, topic_id, description) values ($1, $2, $3)`, [
    learnerId,
    topicId,
    description,
  ]);
}

export async function getMisconceptions(learnerId: string): Promise<Misconception[]> {
  const { rows } = await getPool().query(
    `select topic_id, description, identified_at, resolved from misconceptions
     where learner_id = $1 and resolved = false
     order by identified_at desc`,
    [learnerId]
  );
  return rows.map((r) => ({
    topicId: r.topic_id,
    description: r.description,
    identifiedAt: r.identified_at,
    resolved: r.resolved,
  }));
}

export async function insertQuizAttempt(params: {
  learnerId: string | null;
  sessionId: string | null;
  questionId: string;
  topicId: string;
  answer: string;
  score: number;
  correct: boolean;
  feedback: string;
}): Promise<void> {
  await getPool().query(
    `insert into quiz_attempts (learner_id, session_id, question_id, topic_id, answer, score, correct, feedback)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.learnerId,
      params.sessionId,
      params.questionId,
      params.topicId,
      params.answer,
      params.score,
      params.correct,
      params.feedback,
    ]
  );
}
