import { describe, expect, it } from "vitest";
import { getSceneAnimationState, type AnimatedScene } from "./lessonAnimation";

const scene: AnimatedScene = {
  durationMs: 8000,
  visual: { items: ["A", "B"], steps: ["Push A", "Push B"] },
  timeline: [
    { atMs: 1000, action: "reveal_item", targetIndex: 1 },
    { atMs: 2000, action: "highlight_item", targetIndex: 1, durationMs: 1200 },
    { atMs: 3000, action: "reveal_step", targetIndex: 0 },
    { atMs: 5000, action: "emphasize_text", durationMs: 800 },
  ],
};

describe("deterministic lesson scene timeline", () => {
  it("reveals authored items and steps at their exact cue time", () => {
    expect(getSceneAnimationState(scene, 999).visibleItems.has(1)).toBe(false);
    expect(getSceneAnimationState(scene, 1000).visibleItems.has(1)).toBe(true);
    expect(getSceneAnimationState(scene, 2999).visibleSteps.has(0)).toBe(false);
    expect(getSceneAnimationState(scene, 3000).visibleSteps.has(0)).toBe(true);
  });

  it("holds highlights and text emphasis only for their cue duration", () => {
    expect(getSceneAnimationState(scene, 2500).highlightedItems.has(1)).toBe(true);
    expect(getSceneAnimationState(scene, 3200).highlightedItems.has(1)).toBe(false);
    expect(getSceneAnimationState(scene, 5500).emphasizeText).toBe(true);
    expect(getSceneAnimationState(scene, 5800).emphasizeText).toBe(false);
  });

  it("keeps all content visible when reduced motion is enabled", () => {
    const state = getSceneAnimationState(scene, 0, true);
    expect(state.visibleItems.size).toBe(2);
    expect(state.visibleSteps.size).toBe(2);
    expect(state.highlightedItems.size).toBe(0);
    expect(state.emphasizeText).toBe(false);
  });

  it("preserves legacy scenes without a timeline", () => {
    const state = getSceneAnimationState({ ...scene, timeline: [] }, 0);
    expect(state.visibleItems.size).toBe(2);
    expect(state.visibleSteps.size).toBe(2);
  });
});
