import { describe, expect, it } from "vitest";
import { dailyChallengeQuestionIds, dailyChallengeRewardKey, utcDayKey } from "./dailyChallenge.js";

describe("daily challenge selection", () => {
  const ids = Array.from({ length: 40 }, (_, index) => index + 1);
  it("selects the same unique approved question IDs for the same UTC date", () => {
    const first = dailyChallengeQuestionIds(ids, "2026-11-22");
    expect(first).toEqual(dailyChallengeQuestionIds(ids, "2026-11-22"));
    expect(first).toHaveLength(10);
    expect(new Set(first).size).toBe(10);
    expect(first.every((id) => ids.includes(id))).toBe(true);
  });
  it("handles small banks and invalid or duplicate IDs without fabricating questions", () => {
    expect(dailyChallengeQuestionIds([4, 4, 0, -2, 8], "2026-11-22", 10)).toHaveLength(2);
    expect(dailyChallengeQuestionIds([], "2026-11-22")).toEqual([]);
  });
  it("uses UTC day boundaries for challenge reward idempotency", () => {
    expect(utcDayKey(new Date("2026-11-22T00:30:00+05:30"))).toBe("2026-11-21");
    expect(dailyChallengeRewardKey(new Date("2026-11-22T12:00:00Z"))).toBe("daily-challenge:2026-11-22");
  });
});
