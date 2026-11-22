import { z } from "zod";

export const LessonScriptSchema = z.object({
  title: z.string().trim().min(3).max(160),
  learningObjectives: z.array(z.string().trim().min(3).max(240)).min(2).max(8),
  sections: z.array(z.object({
    heading: z.string().trim().min(2).max(120),
    explanation: z.string().trim().min(20).max(3000),
    example: z.string().trim().max(1800).default(""),
    teacherCue: z.string().trim().max(500).default(""),
  }).strict()).min(2).max(12),
  keyTakeaways: z.array(z.string().trim().min(3).max(300)).min(2).max(10),
  groundingNotes: z.array(z.string().trim().min(3).max(500)).max(12).default([]),
}).strict();

const VisualSchema = z.object({
  label: z.string().trim().max(180).default(""),
  items: z.array(z.string().trim().min(1).max(180)).max(12).default([]),
  connections: z.array(z.object({
    from: z.string().trim().min(1).max(100),
    to: z.string().trim().min(1).max(100),
    label: z.string().trim().max(100).default(""),
  }).strict()).max(16).default([]),
  equation: z.string().trim().max(240).default(""),
  steps: z.array(z.string().trim().min(1).max(240)).max(10).default([]),
}).strict();

export const LessonSceneSchema = z.object({
  sceneType: z.enum(["title_card", "text_reveal", "diagram", "equation", "step_sequence", "checkpoint"]),
  title: z.string().trim().min(2).max(160),
  narration: z.string().trim().min(10).max(1200),
  onScreenText: z.string().trim().max(500).default(""),
  durationMs: z.number().int().min(2500).max(45000),
  visual: VisualSchema.default({ label: "", items: [], connections: [], equation: "", steps: [] }),
}).strict().superRefine((scene, ctx) => {
  if (scene.sceneType === "diagram" && scene.visual.items.length < 2) {
    ctx.addIssue({ code: "custom", message: "Diagram scenes need at least two visual items.", path: ["visual", "items"] });
  }
  if (scene.sceneType === "equation" && !scene.visual.equation.trim()) {
    ctx.addIssue({ code: "custom", message: "Equation scenes need an equation.", path: ["visual", "equation"] });
  }
  if (scene.sceneType === "step_sequence" && scene.visual.steps.length < 2) {
    ctx.addIssue({ code: "custom", message: "Step scenes need at least two steps.", path: ["visual", "steps"] });
  }
});

export const LessonStoryboardSchema = z.object({
  scenes: z.array(LessonSceneSchema).min(3).max(24),
}).strict().superRefine((storyboard, ctx) => {
  if (!storyboard.scenes.some((scene) => scene.sceneType === "diagram" || scene.sceneType === "step_sequence")) {
    ctx.addIssue({ code: "custom", message: "A storyboard needs at least one visual explanation scene.", path: ["scenes"] });
  }
  if (storyboard.scenes.at(-1)?.sceneType !== "checkpoint") {
    ctx.addIssue({ code: "custom", message: "The final scene must be a checkpoint.", path: ["scenes"] });
  }
  if (storyboard.scenes.reduce((sum, scene) => sum + scene.durationMs, 0) > 8 * 60 * 1000) {
    ctx.addIssue({ code: "custom", message: "A lesson timeline cannot exceed eight minutes.", path: ["scenes"] });
  }
  storyboard.scenes.forEach((scene, index) => {
    const labels = new Set(scene.visual.items);
    scene.visual.connections.forEach((connection, connectionIndex) => {
      if (!labels.has(connection.from) || !labels.has(connection.to)) {
        ctx.addIssue({ code: "custom", message: "Diagram connections must reference visible items.", path: ["scenes", index, "visual", "connections", connectionIndex] });
      }
    });
  });
});

export type LessonScript = z.infer<typeof LessonScriptSchema>;
export type LessonStoryboard = z.infer<typeof LessonStoryboardSchema>;
