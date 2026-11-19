import { describe, expect, it } from "vitest";
import { AP_ECET_CSE_2026_QUOTAS, canonicalPaperSubject, selectPaperQuestions, type PaperQuestionCandidate } from "./apEcet2026";

function fullBank(): PaperQuestionCandidate[] {
  const rows: PaperQuestionCandidate[] = [];
  let id = 1;
  for (const [subject, count] of Object.entries(AP_ECET_CSE_2026_QUOTAS)) {
    for (let index = 0; index < count; index += 1) rows.push({ id: id++, subject, difficulty: index % 3 === 0 ? "easy" : index % 3 === 1 ? "medium" : "hard" });
  }
  return rows;
}

describe("AP ECET 2026 CSE paper selection", () => {
  it("matches the official 200-question distribution", () => {
    expect(Object.values(AP_ECET_CSE_2026_QUOTAS).reduce((sum, count) => sum + count, 0)).toBe(200);
    const result = selectPaperQuestions(fullBank(), AP_ECET_CSE_2026_QUOTAS, 20, { easy: 30, medium: 50, hard: 20 }, 2026);
    expect(result.ids).toHaveLength(200);
    expect(new Set(result.ids).size).toBe(200);
    expect(result.shortfalls).toEqual([]);
  });

  it("normalizes legacy subject labels into official syllabus units", () => {
    expect(canonicalPaperSubject("Maths")).toBe("Mathematics");
    expect(canonicalPaperSubject("Data Structures")).toBe("Data Structures through C");
    expect(canonicalPaperSubject("Computer Organization")).toBe("Computer Organisation and Microprocessors");
    expect(canonicalPaperSubject("Java")).toBe("Java Programming");
    expect(canonicalPaperSubject("IoT")).toBe("Internet Of Things(IoT)");
    const candidates = [
      { id: 1, subject: "Maths", difficulty: "easy" },
      { id: 2, subject: "Mathematics", difficulty: "medium" },
      { id: 3, subject: "Data Structures", difficulty: "easy" },
      { id: 4, subject: "Data Structures through C", difficulty: "hard" },
    ];
    const result = selectPaperQuestions(candidates, { Mathematics: 2, "Data Structures through C": 2 }, 20, { easy: 30, medium: 50, hard: 20 }, 1);
    expect(result.ids).toHaveLength(4);
    expect(result.shortfalls).toEqual([]);
  });

  it("reports exact subject quota shortfalls instead of silently shrinking the paper", () => {
    const candidates = [{ id: 1, subject: "Maths", difficulty: "easy" }, { id: 2, subject: "Maths", difficulty: "medium" }, { id: 3, subject: "Java", difficulty: "hard" }];
    const result = selectPaperQuestions(candidates, { Mathematics: 5, "Java Programming": 3 }, 20, { easy: 30, medium: 50, hard: 20 }, 7);
    expect(result.ids).toHaveLength(3);
    expect(result.shortfalls).toEqual([
      { subject: "Mathematics", requested: 5, available: 2 },
      { subject: "Java Programming", requested: 3, available: 1 },
    ]);
  });

  it("selects the same question ids for the same seed and inputs", () => {
    const candidates = fullBank();
    const first = selectPaperQuestions(candidates, AP_ECET_CSE_2026_QUOTAS, 20, { easy: 30, medium: 50, hard: 20 }, 12345);
    const second = selectPaperQuestions(candidates, AP_ECET_CSE_2026_QUOTAS, 20, { easy: 30, medium: 50, hard: 20 }, 12345);
    expect(first.ids).toEqual(second.ids);
  });
});
