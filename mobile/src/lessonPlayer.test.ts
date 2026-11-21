import { describe, expect, it } from "vitest";
import { clampSceneIndex, formatLessonTime, getElapsedBeforeScene, getLessonDurationMs, type LessonStoryboard } from "./lessonPlayer";

const storyboard: LessonStoryboard = {
  scenes: [
    { sceneType: "title_card", title: "Start", narration: "Welcome to this lesson.", onScreenText: "", durationMs: 3000, visual: { label: "", items: [], connections: [], equation: "", steps: [] } },
    { sceneType: "text_reveal", title: "Core idea", narration: "This explains the central idea.", onScreenText: "Core idea", durationMs: 4500, visual: { label: "", items: [], connections: [], equation: "", steps: [] } },
    { sceneType: "checkpoint", title: "Check", narration: "Recall what you learned here.", onScreenText: "", durationMs: 2500, visual: { label: "", items: [], connections: [], equation: "", steps: [] } },
  ],
};

describe("lesson player timeline helpers", () => {
  it("clamps indexes into the available scene range", () => {
    expect(clampSceneIndex(-2, 3)).toBe(0);
    expect(clampSceneIndex(1.8, 3)).toBe(1);
    expect(clampSceneIndex(99, 3)).toBe(2);
    expect(clampSceneIndex(1, 0)).toBe(0);
  });

  it("calculates total and preceding scene time", () => {
    expect(getLessonDurationMs(storyboard)).toBe(10000);
    expect(getElapsedBeforeScene(storyboard, 2)).toBe(7500);
    expect(getElapsedBeforeScene(storyboard, 100)).toBe(7500);
  });

  it("formats time as minutes and seconds", () => {
    expect(formatLessonTime(0)).toBe("0:00");
    expect(formatLessonTime(65000)).toBe("1:05");
    expect(formatLessonTime(-5000)).toBe("0:00");
  });
});
