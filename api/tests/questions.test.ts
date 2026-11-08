import { describe, expect, it } from "vitest";
import {
  decodeOptions,
  hashQuestion,
  normalizeText,
  QuestionInputSchema,
} from "../src/questions.js";

describe("question validation", () => {
  it("accepts a valid question", () => {
    const parsed = QuestionInputSchema.safeParse({
      subject: "Maths",
      text: "What is 2 + 2?",
      options: ["3", "4", "5", "6"],
      correctIndex: 1,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects wrong option counts, empty options, and bad indexes", () => {
    expect(
      QuestionInputSchema.safeParse({
        subject: "M",
        text: "q",
        options: ["a", "b"],
        correctIndex: 0,
      }).success
    ).toBe(false);
    expect(
      QuestionInputSchema.safeParse({
        subject: "M",
        text: "q",
        options: ["a", "", "c", "d"],
        correctIndex: 0,
      }).success
    ).toBe(false);
    expect(
      QuestionInputSchema.safeParse({
        subject: "M",
        text: "q",
        options: ["a", "b", "c", "d"],
        correctIndex: 4,
      }).success
    ).toBe(false);
  });

  it("normalizes and hashes case/space-insensitively", () => {
    expect(normalizeText("  Hello   WORLD ")).toBe("hello world");
    expect(hashQuestion("  Hello   WORLD ")).toBe(hashQuestion("hello world"));
  });

  it("round-trips options through JSON storage", () => {
    const raw = JSON.stringify(["a", "b", "c", "d"]);
    expect(decodeOptions(raw)).toEqual(["a", "b", "c", "d"]);
  });
});
