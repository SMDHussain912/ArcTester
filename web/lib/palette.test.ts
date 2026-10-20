import { describe, expect, it } from "vitest";
import { paletteCounts, paletteStatuses } from "./palette";

describe("paletteStatuses", () => {
  it("classifies current, answered, marked, and unanswered", () => {
    const answers = [0, null, 2, null];
    const marked = new Set([3]);
    const statuses = paletteStatuses(answers, marked, 1);
    expect(statuses).toEqual(["answered", "current", "answered", "marked"]);
  });

  it("gives current priority over marked and answered", () => {
    const statuses = paletteStatuses([0, 1], new Set([0]), 0);
    expect(statuses).toEqual(["current", "answered"]);
  });

  it("treats index 0 as answered (not skipped)", () => {
    const statuses = paletteStatuses([0, null], new Set(), 1);
    expect(statuses).toEqual(["answered", "current"]);
  });
});

describe("paletteCounts", () => {
  it("counts answered, unanswered, marked, total", () => {
    const counts = paletteCounts([0, null, 3, null], new Set([1]));
    expect(counts).toEqual({ answered: 2, unanswered: 2, marked: 1, total: 4 });
  });

  it("handles an empty paper", () => {
    expect(paletteCounts([], new Set())).toEqual({
      answered: 0,
      unanswered: 0,
      marked: 0,
      total: 0,
    });
  });
});
