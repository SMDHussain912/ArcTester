import { describe, expect, it } from "vitest";
import { hapticPattern } from "./feedback";

describe("optional haptic feedback patterns", () => {
  it("uses a short success pattern", () => {
    expect(hapticPattern("success")).toEqual([0, 25, 30, 25]);
  });
  it("uses a distinct error pattern", () => {
    expect(hapticPattern("error")).toEqual([0, 35, 25, 35]);
  });
  it("keeps completion feedback short and bounded", () => {
    const pattern = hapticPattern("complete");
    expect(pattern.length).toBeLessThanOrEqual(6);
    expect(pattern.reduce((sum, duration) => sum + duration, 0)).toBeLessThan(200);
  });
});
