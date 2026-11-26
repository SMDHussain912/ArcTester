import { describe, expect, it } from "vitest";
import { filterResultReview } from "./resultReview";

describe("filterResultReview", () => {
  const questions = [
    { id: 1, isCorrect: true },
    { id: 2, isCorrect: false },
    { id: 3, isCorrect: false },
  ];

  it("returns every question for the all filter without mutating the source", () => {
    expect(filterResultReview(questions, "all")).toEqual(questions);
    expect(filterResultReview(questions, "all")).not.toBe(questions);
    expect(questions).toHaveLength(3);
  });

  it("returns only incorrect questions for mistake review", () => {
    expect(filterResultReview(questions, "incorrect")).toEqual([
      { id: 2, isCorrect: false },
      { id: 3, isCorrect: false },
    ]);
  });

  it("returns an empty list when there are no mistakes", () => {
    expect(filterResultReview([{ isCorrect: true }], "incorrect")).toEqual([]);
  });
});
