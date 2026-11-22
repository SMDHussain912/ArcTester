import { describe, expect, it } from "vitest";
import { parseImportedLessonPackage, validateLessonDraftForPublish } from "./lessonGenerationRoutes.js";

const script = {
  title: "Stack operations",
  learningObjectives: ["Explain stack order", "Trace stack operations"],
  sections: [
    { heading: "Stack", explanation: "A stack is a linear structure that follows last in first out order.", example: "A pile of plates.", teacherCue: "" },
    { heading: "Operations", explanation: "Push adds an element to the top and pop removes the top element.", example: "Push A then B; pop returns B.", teacherCue: "" },
  ],
  keyTakeaways: ["Stack follows LIFO", "Push and pop use the top"],
  groundingNotes: [],
};
const storyboard = {
  scenes: [
    { sceneType: "title_card", title: "Stack", narration: "Learn the stack data structure.", onScreenText: "Stack", durationMs: 3000, visual: {} },
    { sceneType: "step_sequence", title: "Push and pop", narration: "Follow the operations in order.", onScreenText: "", durationMs: 5000, visual: { steps: ["Push A", "Push B", "Pop B"] } },
    { sceneType: "checkpoint", title: "Recall", narration: "Which item is removed first?", onScreenText: "Which item pops first?", durationMs: 3000, visual: {} },
  ],
};
describe("static lesson package import validation", () => {
  it("accepts a valid authored lesson package without invoking a provider", () => {
    const imported = parseImportedLessonPackage({
      title: "Stack operations",
      subject: "Computer Science",
      topic: "Stacks",
      fileName: "stacks.lesson.json",
      script,
      storyboard,
    });
    expect(imported.title).toBe("Stack operations");
    expect(imported.fileName).toBe("stacks.lesson.json");
    expect(imported.script.sections).toHaveLength(2);
    expect(imported.storyboard.scenes).toHaveLength(3);
  });

  it("rejects packages with invalid script or storyboard content", () => {
    expect(() => parseImportedLessonPackage({
      title: "Stack operations",
      subject: "Computer Science",
      topic: "Stacks",
      script: { ...script, sections: [] },
      storyboard,
    })).toThrow();
    expect(() => parseImportedLessonPackage({
      title: "Different title",
      subject: "Computer Science",
      topic: "Stacks",
      script,
      storyboard,
    })).toThrow();
  });
});

describe("lesson draft publishing validation", () => {
  it("accepts schema-valid script and storyboard before publish", () => {
    const parsed = validateLessonDraftForPublish(JSON.stringify(script), JSON.stringify(storyboard));
    expect(parsed.script.title).toBe("Stack operations");
    expect(parsed.storyboard.scenes).toHaveLength(3);
  });
  it("rejects malformed JSON and invalid scene requirements", () => {
    expect(() => validateLessonDraftForPublish("{", JSON.stringify(storyboard))).toThrow();
    const invalid = { ...storyboard, scenes: [{ ...storyboard.scenes[0], sceneType: "equation" }, storyboard.scenes[1], storyboard.scenes[2]] };
    expect(() => validateLessonDraftForPublish(JSON.stringify(script), JSON.stringify(invalid))).toThrow();
  });
});
