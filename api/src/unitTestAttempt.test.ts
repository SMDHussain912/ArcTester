import { describe, expect, it } from "vitest";
import { scoreUnitTestAttempt, unitTestAttemptScope, unitTestCompletionScope } from "./unitTestAttempt.js";

describe("retryable unit-test attempts", () => {
  it("uses a distinct answer scope for every retry", () => {
    expect(unitTestAttemptScope(7, "attempt-one")).not.toBe(unitTestAttemptScope(7, "attempt-two"));
    expect(unitTestCompletionScope(7, "attempt-one")).not.toBe(unitTestAttemptScope(7, "attempt-one"));
  });

  it("scores only the questions and answers from the current attempt", () => {
    const score = scoreUnitTestAttempt([10, 11, 12, 13], [
      { questionId: 10, isCorrect: true },
      { questionId: 11, isCorrect: true },
      { questionId: 12, isCorrect: false },
      { questionId: 13, isCorrect: false },
      // Old-attempt and unrelated rows must not affect this checkpoint.
      { questionId: 99, isCorrect: true },
    ]);
    expect(score).toEqual({ answeredCount: 4, scorePct: 50 });
  });

  it("does not count missing or duplicate question rows as extra answers", () => {
    const score = scoreUnitTestAttempt([1, 2, 3], [
      { questionId: 1, isCorrect: true },
      { questionId: 1, isCorrect: true },
      { questionId: 2, isCorrect: false },
    ]);
    expect(score).toEqual({ answeredCount: 2, scorePct: 33 });
  });
});
