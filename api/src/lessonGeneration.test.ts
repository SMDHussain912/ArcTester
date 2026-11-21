import { describe, expect, it } from "vitest";
import { GenerateLessonInputSchema, LessonScriptSchema, LessonStoryboardSchema, parseModelJson } from "./lessonGeneration.js";

describe("lesson generation contracts", () => {
  it("requires bounded source material and a topic", () => {
    expect(GenerateLessonInputSchema.safeParse({
      subject: "CSE", topic: "Stacks", sourceTitle: "Notes", sourceText: "too short",
    }).success).toBe(false);
  });

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

  it("parses JSON only and strips a conventional code fence", () => {
    const value = { scenes: [
      { sceneType: "title_card", title: "Start", narration: "Introduce this lesson topic.", onScreenText: "Start", durationMs: 3000, visual: {} },
      { sceneType: "step_sequence", title: "Idea", narration: "Explain the central idea in plain words.", onScreenText: "Idea", durationMs: 4000, visual: { steps: ["First", "Next"] } },
      { sceneType: "checkpoint", title: "Check", narration: "Ask the learner to recall the key idea.", onScreenText: "Recall", durationMs: 5000, visual: {} },
    ] };
    const fenced = "```json\n" + JSON.stringify(value) + "\n```";
    expect(parseModelJson(fenced, LessonStoryboardSchema)).toHaveProperty("scenes");
  });
});
