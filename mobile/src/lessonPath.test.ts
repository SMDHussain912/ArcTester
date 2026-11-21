import { describe, expect, it } from "vitest";
import { availableLessonSubjects, availableLessonTopics } from "./lessonPath";
import type { LearningPathSubject } from "./learningPath";

const catalogue: LearningPathSubject[] = [
  { subject: "C Programming", count: 10, practiceCount: 8, topics: [
    { topic: "Pointers", count: 5, practiceCount: 4 },
    { topic: "Empty topic", count: 2, practiceCount: 0 },
  ] },
  { subject: "Empty", count: 0, practiceCount: 0 },
];

describe("lesson catalogue", () => {
  it("only offers subjects with practice questions", () => {
    expect(availableLessonSubjects(catalogue).map((item) => item.subject)).toEqual(["C Programming"]);
  });
  it("only offers topics with practice questions", () => {
    expect(availableLessonTopics(catalogue[0]).map((item) => item.topic)).toEqual(["Pointers"]);
  });
  it("handles a missing subject safely", () => {
    expect(availableLessonTopics(undefined)).toEqual([]);
  });
});
