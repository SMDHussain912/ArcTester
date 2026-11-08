import { describe, expect, it } from "vitest";
import {
  MOCK_QUOTAS,
  MOCK_TOTAL,
  nextStat,
  selectMockTest,
  selectQuestions,
  type SelectableQuestion,
  type StatsById,
} from "../src/selection.js";

type Q = SelectableQuestion;

const q = (id: number, subject = "Maths"): Q => ({ id, subject });
const statsOf = (
  entries: [number, { seen: number; wrong: number; lastSeen?: number }][]
): StatsById => Object.fromEntries(entries.map(([id, s]) => [String(id), s]));

/** Fixed random: always returns `value`, so shuffles are reproducible. */
const fixed = (value: number) => () => value;

describe("selectQuestions", () => {
  it("puts unseen first, then wrong, then oldest-seen", () => {
    const candidates = [q(1), q(2), q(3), q(4), q(5)];
    const stats = statsOf([
      [2, { seen: 3, wrong: 0, lastSeen: 300 }],
      [3, { seen: 2, wrong: 2, lastSeen: 200 }],
      [4, { seen: 5, wrong: 0, lastSeen: 100 }],
      [5, { seen: 5, wrong: 0, lastSeen: 999 }],
    ]);
    const picked = selectQuestions(candidates, stats, 5, fixed(0.999));
    // id 1 unseen first; id 3 wrong next; group 3 by oldest lastSeen:
    // id 4 (100) < id 2 (300) < id 5 (999).
    expect(picked.map((x) => x.id)).toEqual([1, 3, 4, 2, 5]);
    expect(picked[0].id).toBe(1);
    expect(picked[1].id).toBe(3);
    expect(picked[picked.length - 1].id).toBe(5);
  });

  it("orders wrong by higher count first", () => {
    const candidates = [q(1), q(2), q(3)];
    const stats = statsOf([
      [1, { seen: 1, wrong: 1, lastSeen: 10 }],
      [2, { seen: 1, wrong: 5, lastSeen: 20 }],
      [3, { seen: 1, wrong: 3, lastSeen: 30 }],
    ]);
    const picked = selectQuestions(candidates, stats, 3, fixed(0.999));
    expect(picked.map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("is deterministic with the same injected random", () => {
    const candidates = [q(1), q(2), q(3), q(4), q(5), q(6)];
    const a = selectQuestions(candidates, {}, 6, fixed(0.42));
    const b = selectQuestions(candidates, {}, 6, fixed(0.42));
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it("never duplicates and never returns more than requested", () => {
    const candidates = [q(1), q(1), q(2), q(2), q(3)];
    const picked = selectQuestions(candidates, {}, 2, fixed(0.5));
    expect(picked).toHaveLength(2);
    expect(new Set(picked.map((x) => String(x.id))).size).toBe(2);
  });

  it("handles empty bank and over-requests", () => {
    expect(selectQuestions([], {}, 10)).toEqual([]);
    expect(selectQuestions([q(1), q(2)], {}, 0)).toEqual([]);
    expect(selectQuestions([q(1), q(2)], {}, 99, fixed(0.1))).toHaveLength(2);
  });

  it("rejects negative or fractional counts", () => {
    expect(() => selectQuestions([q(1)], {}, -1)).toThrow();
    expect(() => selectQuestions([q(1)], {}, 1.5)).toThrow();
  });
});

describe("selectMockTest", () => {
  it("sums to 200 with a full bank and no shortfalls", () => {
    const candidates: Q[] = [];
    let id = 1;
    for (const quota of MOCK_QUOTAS) {
      for (let i = 0; i < quota.count; i++) candidates.push(q(id++, quota.subject));
    }
    const { questions, shortfalls } = selectMockTest(candidates, {}, fixed(0.7));
    expect(MOCK_TOTAL).toBe(200);
    expect(questions).toHaveLength(200);
    expect(shortfalls).toEqual([]);
  });

  it("uses what exists and warns per subject on a thin bank", () => {
    const candidates: Q[] = [q(1, "Maths"), q(2, "Maths"), q(3, "Python")];
    const { questions, shortfalls } = selectMockTest(candidates, {}, fixed(0.1));
    expect(questions).toHaveLength(3);
    const maths = shortfalls.find((s) => s.subject === "Maths");
    const physics = shortfalls.find((s) => s.subject === "Physics");
    expect(maths).toMatchObject({ requested: 50, available: 2 });
    expect(physics).toMatchObject({ requested: 25, available: 0 });
    expect(shortfalls.length).toBeGreaterThan(0);
    expect(shortfalls.every((s) => s.available < s.requested)).toBe(true);
  });
});

describe("nextStat", () => {
  it("counts a correct answer as seen+1 and heals wrong (floor 0)", () => {
    expect(nextStat({ seen: 2, wrong: 3 }, "correct").wrong).toBe(2);
    const fresh = nextStat(undefined, "correct");
    expect(fresh).toMatchObject({ seen: 1, wrong: 0 });
  });

  it("counts wrong and unanswered as seen+1, wrong+1", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(nextStat({ seen: 1, wrong: 0, lastSeen: 5 }, "wrong", now)).toMatchObject({
      seen: 2,
      wrong: 1,
      lastSeen: now,
    });
    expect(nextStat({ seen: 4, wrong: 2 }, "unanswered", now).wrong).toBe(3);
  });
});
