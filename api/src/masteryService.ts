export type ReviewSchedule = { intervalDays: number; repetitions: number; nextReviewAt: Date };

/** Fixed, transparent SM-2-inspired schedule; wrong answers return tomorrow. */
export function nextReviewSchedule(
  previousIntervalDays: number,
  previousRepetitions: number,
  wasCorrect: boolean,
  reviewedAt = new Date(),
): ReviewSchedule {
  const repetitions = wasCorrect ? previousRepetitions + 1 : 0;
  const intervalDays = wasCorrect
    ? previousRepetitions <= 0 ? 1
      : previousRepetitions === 1 ? 3
        : Math.min(30, Math.max(1, Math.round(Math.max(previousIntervalDays, 1) * 2.5)))
    : 1;
  const nextReviewAt = new Date(reviewedAt);
  nextReviewAt.setUTCDate(nextReviewAt.getUTCDate() + intervalDays);
  if (!wasCorrect) nextReviewAt.setUTCHours(0, 0, 0, 0);
  return { intervalDays, repetitions, nextReviewAt };
}

export const DAILY_QUESTS = [
  { key: "lesson", title: "Finish a lesson", description: "Complete one learning-path lesson.", target: 1 },
  { key: "practice", title: "Practice today", description: "Submit one practice paper.", target: 1 },
  { key: "mistakes", title: "Fix your mistakes", description: "Review three due questions correctly or incorrectly.", target: 3 },
] as const;

export const BADGES = [
  { key: "first-lesson", title: "First Steps", description: "Complete your first lesson." },
  { key: "xp-100", title: "XP Starter", description: "Earn 100 lifetime XP." },
  { key: "streak-7", title: "Week Warrior", description: "Reach a 7-day streak." },
  { key: "topic-master", title: "Topic Master", description: "Reach 80% mastery in a topic with at least 10 answered questions." },
  { key: "review-10", title: "Mistake Breaker", description: "Complete 10 spaced-review answers." },
] as const;
