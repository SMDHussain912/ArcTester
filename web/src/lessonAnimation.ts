export type TimelineAction = {
  atMs: number;
  action: "reveal_item" | "highlight_item" | "reveal_step" | "emphasize_text";
  targetIndex?: number;
  durationMs?: number;
};

export type AnimatedScene = {
  durationMs: number;
  timeline?: TimelineAction[];
  visual: { items: string[]; steps: string[] };
};

export type SceneAnimationState = {
  visibleItems: Set<number>;
  highlightedItems: Set<number>;
  visibleSteps: Set<number>;
  emphasizeText: boolean;
};

export function getSceneAnimationState(scene: AnimatedScene, timeMs: number, reducedMotion = false): SceneAnimationState {
  const visibleItems = new Set(scene.visual.items.map((_, index) => index));
  const highlightedItems = new Set<number>();
  const visibleSteps = new Set(scene.visual.steps.map((_, index) => index));
  const timeline = scene.timeline ?? [];
  if (reducedMotion || timeline.length === 0) {
    return { visibleItems, highlightedItems, visibleSteps, emphasizeText: false };
  }

  const now = Math.max(0, Math.min(scene.durationMs, Number.isFinite(timeMs) ? timeMs : 0));
  const revealItems = new Set(timeline.filter((action) => action.action === "reveal_item").map((action) => action.targetIndex));
  const revealSteps = new Set(timeline.filter((action) => action.action === "reveal_step").map((action) => action.targetIndex));
  for (const index of revealItems) if (index !== undefined) visibleItems.delete(index);
  for (const index of revealSteps) if (index !== undefined) visibleSteps.delete(index);

  let emphasizeText = false;
  for (const action of timeline) {
    const started = action.atMs <= now;
    const active = started && now < action.atMs + (action.durationMs ?? 600);
    if (action.action === "reveal_item" && started && action.targetIndex !== undefined) visibleItems.add(action.targetIndex);
    if (action.action === "reveal_step" && started && action.targetIndex !== undefined) visibleSteps.add(action.targetIndex);
    if (action.action === "highlight_item" && active && action.targetIndex !== undefined) highlightedItems.add(action.targetIndex);
    if (action.action === "emphasize_text" && active) emphasizeText = true;
  }
  return { visibleItems, highlightedItems, visibleSteps, emphasizeText };
}
