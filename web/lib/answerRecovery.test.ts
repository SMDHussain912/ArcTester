import { describe, expect, it } from "vitest";
import { mergeAssignedExamAnswers } from "./answerRecovery";

describe("mergeAssignedExamAnswers", () => {
  it("preserves local answers newer than the debounced server snapshot", () => {
    expect(mergeAssignedExamAnswers(
      { q1: 0, q2: 1 },
      { q1: 3, q3: 2 },
    )).toEqual({ q1: 3, q2: 1, q3: 2 });
  });

  it("uses server answers when there is no local backup for a question", () => {
    expect(mergeAssignedExamAnswers({ q1: 2 }, {})).toEqual({ q1: 2 });
  });

  it("returns an empty answer set when neither source has answers", () => {
    expect(mergeAssignedExamAnswers({}, {})).toEqual({});
  });
});
