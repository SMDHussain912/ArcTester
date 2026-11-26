import { describe, expect, it } from "vitest";
import { toggleMultiSelectAnswer } from "./multiSelectAnswer";

describe("toggleMultiSelectAnswer", () => {
  it("adds an option without mutating the previous response", () => {
    const current = [0];
    expect(toggleMultiSelectAnswer(current, 2, 4)).toEqual([0, 2]);
    expect(current).toEqual([0]);
  });
  it("removes an already selected option", () => {
    expect(toggleMultiSelectAnswer([1, 2], 1, 4)).toEqual([2]);
  });
  it("returns a sorted unique response", () => {
    expect(toggleMultiSelectAnswer([3, 1, 1], 2, 4)).toEqual([1, 2, 3]);
  });
  it("treats malformed existing values as unanswered", () => {
    expect(toggleMultiSelectAnswer("invalid", 0, 4)).toEqual([0]);
  });
  it("rejects an out-of-range selection", () => {
    expect(() => toggleMultiSelectAnswer([0], 4, 4)).toThrow(/out of range/i);
  });
});
