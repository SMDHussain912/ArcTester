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
