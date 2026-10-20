import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFromJson } from "../src/importService.js";
import { buildApp } from "../src/index.js";
import { getJson, postJson, startTestServer, type TestServer } from "./server.js";

let server: TestServer;

const BANK: unknown[] = [
  ["Maths", "Maths Q1?", ["a1", "b1", "c1", "d1"], 0, "exp-m1"],
  ["Maths", "Maths Q2?", ["a2", "b2", "c2", "d2"], 1, "exp-m2"],
  ["Maths", "Maths Q3?", ["a3", "b3", "c3", "d3"], 2, "exp-m3"],
  ["Physics", "Physics Q1?", ["p1", "q1", "r1", "s1"], 3, "exp-p1"],
];

beforeAll(async () => {
  server = await startTestServer(buildApp);
  const report = await importFromJson(server.db, BANK);
  expect(report.added).toBe(4);
});

afterAll(async () => {
  await server.close();
});

describe("POST /tests", () => {
  it("builds a practice set without leaking answers", async () => {
    const { status, json } = await postJson(`${server.baseUrl}/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 2,
    });
    expect(status).toBe(201);
    const body = json as {
      attemptId: number;
      deadline: string;
      warnings: string[];
      questions: { id: number; subject: string; text: string; options: string[] }[];
    };
    expect(body.questions).toHaveLength(2);
    expect(body.questions.every((q) => q.subject === "Maths")).toBe(true);
    expect(body.deadline).toBeTruthy();
    for (const q of body.questions) {
      expect(q).not.toHaveProperty("correctIndex");
      expect(q).not.toHaveProperty("explanation");
      expect(q.options).toHaveLength(4);
    }
  });

  it("warns on shortfall with a thin bank", async () => {
    const { json } = await postJson(`${server.baseUrl}/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 50,
    });
    const body = json as { questions: unknown[]; warnings: string[] };
    expect(body.questions).toHaveLength(3);
    expect(body.warnings).toHaveLength(1);
    expect(body.warnings[0]).toContain("Maths");
  });

  it("rejects invalid bodies with friendly 400s", async () => {
    const { status, json } = await postJson(`${server.baseUrl}/tests`, { mode: "nope" });
    expect(status).toBe(400);
    expect((json as { error: string }).error).toBe("That request was invalid.");
    const missing = await postJson(`${server.baseUrl}/tests`, { mode: "practice" });
    expect(missing.status).toBe(400);
  });
});

describe("submit + result", () => {
  it("scores, persists, and reveals answers only after submit", async () => {
    const created = (await postJson(`${server.baseUrl}/tests`, {
      mode: "practice",
      subject: "Physics",
      count: 1,
    })) as { status: number; json: { attemptId: number; questions: { id: number }[] } };
    const attemptId = created.json.attemptId;
    const questionId = created.json.questions[0].id;

    const early = await getJson(`${server.baseUrl}/tests/${attemptId}/result`);
    expect(early.status).toBe(403);

    const correct = await server.db.question.findUniqueOrThrow({ where: { id: questionId } });
    const submitted = await postJson(`${server.baseUrl}/tests/${attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: correct.correctIndex }],
    });
    expect(submitted.status).toBe(200);
    expect(submitted.json).toMatchObject({ attemptId, score: 1, total: 1, expired: false });

    const result = await getJson(`${server.baseUrl}/tests/${attemptId}/result`);
    expect(result.status).toBe(200);
    const body = result.json as {
      score: number;
      breakdown: { subject: string; correct: number; total: number }[];
      questions: { correctIndex: number; explanation: string; isCorrect: boolean }[];
    };
    expect(body.score).toBe(1);
    expect(body.breakdown).toEqual([{ subject: "Physics", correct: 1, total: 1 }]);
    expect(body.questions[0]).toMatchObject({
      correctIndex: correct.correctIndex,
      explanation: "exp-p1",
      isCorrect: true,
    });

    const stat = await server.db.stat.findUniqueOrThrow({ where: { questionId } });
    expect(stat).toMatchObject({ seen: 1, wrong: 0 });

    const again = await postJson(`${server.baseUrl}/tests/${attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: 0 }],
    });
    expect(again.status).toBe(409);
  });

  it("rejects answers for foreign questions", async () => {
    const created = (await postJson(`${server.baseUrl}/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    })) as { status: number; json: { attemptId: number } };
    const other = await server.db.question.findFirstOrThrow({
      where: { subject: { name: "Physics" } },
    });
    const res = await postJson(`${server.baseUrl}/tests/${created.json.attemptId}/submit`, {
      answers: [{ questionId: other.id, selectedIndex: 0 }],
    });
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toContain("not in this test");
  });

  it("counts unanswered as wrong in stats", async () => {
    const created = (await postJson(`${server.baseUrl}/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    })) as { status: number; json: { attemptId: number; questions: { id: number }[] } };
    const attemptId = created.json.attemptId;
    const questionId = created.json.questions[0].id;
    await postJson(`${server.baseUrl}/tests/${attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: null }],
    });
    const stat = await server.db.stat.findUniqueOrThrow({ where: { questionId } });
    expect(stat.wrong).toBeGreaterThanOrEqual(1);
  });

  it("marks a late submit as expired but still scores it", async () => {
    const created = (await postJson(`${server.baseUrl}/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    })) as { status: number; json: { attemptId: number; questions: { id: number }[] } };
    const attemptId = created.json.attemptId;
    const questionId = created.json.questions[0].id;
    await server.db.attempt.update({
      where: { id: attemptId },
      data: { deadline: new Date("2000-01-01T00:00:00Z") },
    });
    const res = await postJson(`${server.baseUrl}/tests/${attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: 0 }],
    });
    expect(res.status).toBe(200);
    expect((res.json as { expired: boolean }).expired).toBe(true);
    const result = (await getJson(`${server.baseUrl}/tests/${attemptId}/result`)).json as {
      expired: boolean;
    };
    expect(result.expired).toBe(true);
  });
});
