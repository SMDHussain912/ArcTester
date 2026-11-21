import { describe, expect, it } from "vitest";
import { allUnitCheckpointAnswersSaved, unitCheckpointPassed } from "./unitTestCheckpoint.js";

describe("unit checkpoint completion", () => {
  const ids = Array.from({ length: 10 }, (_, index) => index + 1);
  it("requires exactly ten saved answers before submission", () => {
    expect(allUnitCheckpointAnswersSaved(ids, Object.fromEntries(ids.map((id) => [id, true])))).toBe(true);
    expect(allUnitCheckpointAnswersSaved(ids, { ...Object.fromEntries(ids.map((id) => [id, true])), 10: false })).toBe(false);
    expect(allUnitCheckpointAnswersSaved(ids.slice(0, 9), Object.fromEntries(ids.map((id) => [id, true])))).toBe(false);
  });
  it("uses the existing 70 percent pass threshold", () => {
    expect(unitCheckpointPassed(70)).toBe(true);
    expect(unitCheckpointPassed(69)).toBe(false);
    expect(unitCheckpointPassed(Number.NaN)).toBe(false);
  });
});
