import { describe, expect, it } from "vitest";
import { getRemainingPracticeSeconds } from "./practiceTimer";
describe("practice timer", () => {
  it("returns null when a practice session has no finite deadline", () => {
    expect(getRemainingPracticeSeconds(Number.POSITIVE_INFINITY, 1000, 0)).toBeNull();
    expect(getRemainingPracticeSeconds(Number.NaN, 1000, 0)).toBeNull();
  });
  it("uses the server offset with the monotonic clock and rounds partial seconds up", () => {
    expect(getRemainingPracticeSeconds(20_000, 5_000, 2_000)).toBe(13);
    expect(getRemainingPracticeSeconds(20_000, 5_000, 5_000)).toBe(10);
  });
  it("never returns a negative countdown after the deadline", () => {
    expect(getRemainingPracticeSeconds(10_000, 12_000, 0)).toBe(0);
  });
});
