// spec §20 — mastery must move from evidence (a graded quiz answer), not
// from having merely read an explanation, and one attempt shouldn't swing
// mastery from 0 to 1. A score of 1.0 nudges mastery up by 0.15; a score
// of 0.0 nudges it down by 0.15; a 0.5 (partial credit) leaves it flat.
export function computeMasteryDelta(score: number): number {
  return (score - 0.5) * 0.3;
}
