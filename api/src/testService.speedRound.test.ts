import { describe, expect, it } from "vitest";
import { CreateTestSchema, minutesFor } from "./testService.js";

describe("speed round attempt contract", () => {
  it("accepts a speed round with selected subjects and at most ten questions", () => {
    const parsed = CreateTestSchema.safeParse({
      mode: "speedRound",
      subjects: ["Computer Science"],
      count: 10,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects speed rounds larger than ten questions", () => {
    const parsed = CreateTestSchema.safeParse({
      mode: "speedRound",
      subjects: ["Computer Science"],
      count: 11,
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a subject selection", () => {
    const parsed = CreateTestSchema.safeParse({ mode: "speedRound", count: 10 });
    expect(parsed.success).toBe(false);
  });

  it("uses a fixed five-minute server deadline", () => {
    expect(minutesFor("speedRound", 1)).toBe(5);
    expect(minutesFor("speedRound", 10)).toBe(5);
  });

  it("leaves existing practice and mock durations unchanged", () => {
    expect(minutesFor("practice", 20)).toBe(18);
    expect(minutesFor("mock", 200)).toBe(180);
  });
});
