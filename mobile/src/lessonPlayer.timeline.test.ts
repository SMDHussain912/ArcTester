import { getSceneAnimationState, type LessonScene } from "./lessonPlayer";

const animatedScene: LessonScene = {
  sceneType: "diagram", title: "Queue", narration: "Items enter and leave in order.", onScreenText: "",
  durationMs: 6000,
  visual: { label: "Queue", items: ["front", "rear"], connections: [], equation: "", steps: ["enqueue", "dequeue"] },
  timeline: [
    { atMs: 1000, action: "reveal_item", targetIndex: 1 },
    { atMs: 2000, action: "highlight_item", targetIndex: 1, durationMs: 1000 },
    { atMs: 3000, action: "reveal_step", targetIndex: 0 },
  ],
};

describe("mobile scene animation timeline", () => {
  it("matches the declarative reveal and highlight rules", () => {
    expect(getSceneAnimationState(animatedScene, 999).visibleItems.has(1)).toBe(false);
    expect(getSceneAnimationState(animatedScene, 1000).visibleItems.has(1)).toBe(true);
    expect(getSceneAnimationState(animatedScene, 2500).highlightedItems.has(1)).toBe(true);
    expect(getSceneAnimationState(animatedScene, 3200).highlightedItems.has(1)).toBe(false);
    expect(getSceneAnimationState(animatedScene, 3000).visibleSteps.has(0)).toBe(true);
  });

  it("renders all content in reduced motion and for legacy scenes", () => {
    expect(getSceneAnimationState(animatedScene, 0, true).visibleItems.size).toBe(2);
    expect(getSceneAnimationState({ ...animatedScene, timeline: [] }, 0).visibleSteps.size).toBe(2);
  });
});
