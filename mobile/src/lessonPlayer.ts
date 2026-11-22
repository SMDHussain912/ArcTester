export type LessonSceneType = "title_card" | "text_reveal" | "diagram" | "equation" | "step_sequence" | "checkpoint";

export type LessonScene = {
  sceneType: LessonSceneType;
  title: string;
  narration: string;
  onScreenText: string;
  durationMs: number;
  visual: {
    label: string;
    items: string[];
    connections: { from: string; to: string; label: string }[];
    equation: string;
    steps: string[];
  };
  timeline?: LessonTimelineAction[];
};

export type LessonTimelineAction = {
  atMs: number;
  action: "reveal_item" | "highlight_item" | "reveal_step" | "emphasize_text";
  targetIndex?: number;
  durationMs?: number;
};

export type LessonStoryboard = { scenes: LessonScene[] };

export type PublishedLesson = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  script: { title: string; learningObjectives: string[]; sections: { heading: string; explanation: string; example: string; teacherCue: string }[]; keyTakeaways: string[]; groundingNotes: string[] };
  storyboard: LessonStoryboard;
};

export function clampSceneIndex(index: number, sceneCount: number): number {
  if (!Number.isFinite(index) || sceneCount <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(index), sceneCount - 1));
}

export function getLessonDurationMs(storyboard: LessonStoryboard): number {
  return storyboard.scenes.reduce((total, scene) => total + Math.max(0, scene.durationMs), 0);
}

export function getElapsedBeforeScene(storyboard: LessonStoryboard, sceneIndex: number): number {
  const safeIndex = clampSceneIndex(sceneIndex, storyboard.scenes.length);
  return storyboard.scenes.slice(0, safeIndex).reduce((total, scene) => total + Math.max(0, scene.durationMs), 0);
}

export function formatLessonTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
export type SceneAnimationState = {
  visibleItems: Set<number>;
  highlightedItems: Set<number>;
  visibleSteps: Set<number>;
  emphasizeText: boolean;
};

export function getSceneAnimationState(scene: LessonScene, timeMs: number, reducedMotion = false): SceneAnimationState {
  const visibleItems = new Set(scene.visual.items.map((_, index) => index));
  const highlightedItems = new Set<number>();
  const visibleSteps = new Set(scene.visual.steps.map((_, index) => index));
  const timeline = scene.timeline ?? [];
  if (reducedMotion || timeline.length === 0) return { visibleItems, highlightedItems, visibleSteps, emphasizeText: false };

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
