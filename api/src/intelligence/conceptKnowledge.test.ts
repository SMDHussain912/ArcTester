import { describe, expect, it } from "vitest";
import { getLearningConcept, getLearningConceptsForTopic, listLearningConcepts } from "./conceptKnowledge.js";

describe("curated concept knowledge", () => {
  it("lists concepts with definitions and learning supports", () => {
    const concepts = listLearningConcepts();
    expect(concepts.length).toBeGreaterThanOrEqual(8);
    expect(concepts.every((item) => item.definition.length > 20 && item.examples.length > 0)).toBe(true);
  });

  it("searches concept content case-insensitively", () => {
    expect(listLearningConcepts({ query: "fifo" }).map((item) => item.slug)).toContain("queue");
    expect(listLearningConcepts({ query: "NETwork" }).map((item) => item.slug)).toContain("osi-model");
  });

  it("filters by subject and applies a bounded result limit", () => {
    const results = listLearningConcepts({ subject: "physics", limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].subject).toBe("Physics");
    expect(listLearningConcepts({ limit: 1000 })).toHaveLength(10);
  });

  it("returns a concept by slug and null for unknown concepts", () => {
    expect(getLearningConcept("stack")?.title).toBe("Stack");
    expect(getLearningConcept("not-a-concept")).toBeNull();
  });
});


describe("getLearningConceptsForTopic", () => {
  it("returns curated concepts for an exact topic match", () => {
    expect(getLearningConceptsForTopic("Data Structures")).toEqual([
      { slug: "stack", title: "Stack" },
      { slug: "queue", title: "Queue" },
      { slug: "linked-list", title: "Linked List" },
    ]);
  });

  it("does not guess when topic is missing or only loosely similar", () => {
    expect(getLearningConceptsForTopic(null)).toEqual([]);
    expect(getLearningConceptsForTopic("Data Structure")).toEqual([]);
    expect(getLearningConceptsForTopic("")).toEqual([]);
  });
});
