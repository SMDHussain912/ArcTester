import { describe, expect, it } from "vitest";
import { CreateTestSchema, minutesFor } from "./testService.js";

describe("daily challenge contract", () => {
  it("accepts a challenge without client-supplied subjects", () => {
    expect(CreateTestSchema.safeParse({ mode: "dailyChallenge", count: 10 }).success).toBe(true);
  });
  it("caps the daily challenge at ten questions", () => {
    expect(CreateTestSchema.safeParse({ mode: "dailyChallenge", count: 11 }).success).toBe(false);
  });
  it("uses a ten-minute deadline and leaves practice durations intact", () => {
    expect(minutesFor("dailyChallenge", 10)).toBe(10);
    expect(minutesFor("practice", 20)).toBe(18);
    expect(minutesFor("mock", 200)).toBe(180);
  });
});
