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

  it("accepts and validates college/branch audience metadata for imported lesson packages", () => {
    const imported = parseImportedLessonPackage({
      title: "Stack operations", subject: "Computer Science", topic: "Stacks", script, storyboard,
      audienceScope: "BRANCH", targetCollegeCode: "010", targetBranchCode: "CM",
    });
    expect(imported).toMatchObject({ audienceScope: "BRANCH", targetCollegeCode: "010", targetBranchCode: "CM" });
    expect(() => parseImportedLessonPackage({
      title: "Stack operations", subject: "Computer Science", topic: "Stacks", script, storyboard,
      audienceScope: "BRANCH",
    })).toThrow();
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

describe("lesson animation timeline validation", () => {
  it("accepts safe declarative timeline actions and defaults old scenes to an empty timeline", () => {
    const withTimeline = {
      ...storyboard,
      scenes: [
        storyboard.scenes[0],
        { ...storyboard.scenes[1], sceneType: "diagram", visual: { label: "Stack", items: ["A", "B"], connections: [], equation: "", steps: [] }, timeline: [
          { atMs: 500, action: "reveal_item", targetIndex: 0 },
          { atMs: 1200, action: "highlight_item", targetIndex: 1, durationMs: 800 },
          { atMs: 2000, action: "emphasize_text", durationMs: 500 },
        ] },
        storyboard.scenes[2],
      ],
    };
    const parsed = parseImportedLessonPackage({ title: "Stack operations", subject: "Computer Science", topic: "Stacks", script, storyboard: withTimeline });
    expect(parsed.storyboard.scenes[1].timeline).toHaveLength(3);
    expect(parsed.storyboard.scenes[0].timeline).toEqual([]);
  });

  it("rejects timeline actions outside the scene or beyond visual targets", () => {
    const badTarget = {
      ...storyboard,
      scenes: [
        storyboard.scenes[0],
        { ...storyboard.scenes[1], timeline: [{ atMs: 500, action: "reveal_step", targetIndex: 9 }] },
        storyboard.scenes[2],
      ],
    };
    expect(() => parseImportedLessonPackage({ title: "Stack operations", subject: "Computer Science", topic: "Stacks", script, storyboard: badTarget })).toThrow();

    const lateCue = {
      ...storyboard,
      scenes: [
        storyboard.scenes[0],
        { ...storyboard.scenes[1], timeline: [{ atMs: 5000, action: "reveal_step", targetIndex: 0 }] },
        storyboard.scenes[2],
      ],
    };
    expect(() => parseImportedLessonPackage({ title: "Stack operations", subject: "Computer Science", topic: "Stacks", script, storyboard: lateCue })).toThrow();
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

