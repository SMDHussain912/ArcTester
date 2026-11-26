import { describe, expect, it } from "vitest";
import { BADGES, DAILY_QUESTS, nextReviewSchedule } from "./masteryService.js";

describe("rule-based spaced repetition", () => {
  it("schedules a wrong answer for the next UTC day and resets repetitions", () => {
    const reviewedAt = new Date("2026-11-22T15:30:00.000Z");
    const result = nextReviewSchedule(8, 4, false, reviewedAt);
    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(0);
    expect(result.nextReviewAt.toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });

  it("increases the interval after successive correct answers", () => {
    const reviewedAt = new Date("2026-11-22T15:30:00.000Z");
    expect(nextReviewSchedule(0, 0, true, reviewedAt).intervalDays).toBe(1);
    expect(nextReviewSchedule(1, 1, true, reviewedAt).intervalDays).toBe(3);
    expect(nextReviewSchedule(3, 2, true, reviewedAt).intervalDays).toBe(8);
    expect(nextReviewSchedule(20, 3, true, reviewedAt).intervalDays).toBe(30);
  });

  it("defines three actionable daily quests and five durable badges", () => {
    expect(DAILY_QUESTS.map((quest) => quest.key)).toEqual(["lesson", "practice", "mistakes"]);
    expect(DAILY_QUESTS.every((quest) => quest.target > 0 && quest.rewardXp === 15)).toBe(true);
    expect(BADGES.map((badge) => badge.key)).toEqual(["first-lesson", "xp-100", "streak-7", "topic-master", "review-10"]);
  });
});
