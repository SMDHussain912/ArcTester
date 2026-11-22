import { describe, expect, it } from "vitest";
import { LessonScriptSchema, LessonStoryboardSchema } from "./lessonGeneration.js";

describe("static lesson content contracts", () => {
  it("accepts a script with objectives, sections and takeaways", () => {
    const script = {
      title: "Stack basics",
      learningObjectives: ["Explain LIFO", "Trace push and pop"],
      sections: [
        { heading: "Meaning", explanation: "A stack stores items using last in first out order.", example: "A stack of plates.", teacherCue: "" },
        { heading: "Operations", explanation: "Push adds to the top and pop removes from the top.", example: "Push A then B; pop returns B.", teacherCue: "" },
      ],
      keyTakeaways: ["Stack follows LIFO", "Push and pop operate at the top"],
      groundingNotes: [],
    };
    expect(LessonScriptSchema.parse(script)).toEqual(script);
  });

  it("rejects unsafe or unsupported scene types and malformed diagrams", () => {
    const base = { title: "A diagram", narration: "Explain how these two parts connect.", onScreenText: "", durationMs: 6000, visual: { label: "", items: ["A"], connections: [], equation: "", steps: [] } };
    expect(LessonStoryboardSchema.safeParse({ scenes: [{ ...base, sceneType: "script" }] }).success).toBe(false);
    expect(LessonStoryboardSchema.safeParse({ scenes: Array.from({ length: 3 }, () => ({ ...base, sceneType: "diagram" })) }).success).toBe(false);
  });

});
