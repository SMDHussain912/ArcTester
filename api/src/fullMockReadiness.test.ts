import { describe, expect, it } from "vitest";
import { fullMockReadinessIssue, minutesFor } from "./testService.js";
import { MOCK_TOTAL } from "./selection.js";

describe("full AP ECET mock readiness", () => {
  it("allows only a complete blueprint with no subject shortfalls", () => {
    expect(MOCK_TOTAL).toBe(200);
    expect(fullMockReadinessIssue(200, [])).toBeNull();
  });

  it("rejects a paper with subject-level shortages instead of allowing a partial attempt", () => {
    expect(fullMockReadinessIssue(190, [
      { subject: "Mathematics", requested: 50, available: 40 },
      { subject: "Physics", requested: 25, available: 20 },
    ])).toContain("Mathematics: 40/50; Physics: 20/25");
  });

  it("rejects a count mismatch even if the selection helper did not report shortages", () => {
    expect(fullMockReadinessIssue(199, [])).toContain("199/200 questions selected");
  });

  it("keeps the full mock duration at 180 minutes", () => {
    expect(minutesFor("mock", 200)).toBe(180);
  });
});
