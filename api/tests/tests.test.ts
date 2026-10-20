import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFromJson } from "../src/importService.js";
import { buildApp } from "../src/index.js";
import { bindSession, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let api: ReturnType<typeof bindSession>;
let userId: number;

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
  const session = await signUp(server.baseUrl, "student@example.com");
  api = bindSession(server.baseUrl, session.cookie);
  userId = session.userId;
});

afterAll(async () => {
  await server.close();
});

describe("authentication", () => {
  it("rejects unauthenticated requests to protected routes", async () => {
    const anon = await fetch(`${server.baseUrl}/tests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "practice", subject: "Maths", count: 1 }),
    });
    expect(anon.status).toBe(403);

    const weak = await fetch(`${server.baseUrl}/analytics/weak-topics`);
    expect(weak.status).toBe(403);
  });

  it("rejects a tampered session cookie", async () => {
    const res = await fetch(`${server.baseUrl}/tests/1`, {
      headers: { cookie: "ecet_session=not.a.real.token" },
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /tests", () => {
  it("builds a practice set without leaking answers", async () => {
    const { status, json } = await api.post(`/tests`, {
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
    const { json } = await api.post(`/tests`, {
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
    const { status, json } = await api.post(`/tests`, { mode: "nope" });
    expect(status).toBe(400);
    expect((json as { error: string }).error).toBe("That request was invalid.");
    const missing = await api.post(`/tests`, { mode: "practice" });
    expect(missing.status).toBe(400);
  });
});

describe("submit + result", () => {
  it("scores, persists, and reveals answers only after submit", async () => {
    const created = (await api.post(`/tests`, {
      mode: "practice",
      subject: "Physics",
      count: 1,
    })) as { status: number; json: { attemptId: number; questions: { id: number }[] } };
    const attemptId = created.json.attemptId;
    const questionId = created.json.questions[0].id;

    const early = await api.get(`/tests/${attemptId}/result`);
    expect(early.status).toBe(403);

    const correct = await server.db.question.findUniqueOrThrow({ where: { id: questionId } });
    const submitted = await api.post(`/tests/${attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: correct.correctIndex }],
    });
    expect(submitted.status).toBe(200);
    expect(submitted.json).toMatchObject({ attemptId, score: 1, total: 1, expired: false });

    const result = await api.get(`/tests/${attemptId}/result`);
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

    const stat = await server.db.stat.findUniqueOrThrow({
      where: { userId_questionId: { userId, questionId } },
    });
    expect(stat).toMatchObject({ seen: 1, wrong: 0 });

    const again = await api.post(`/tests/${attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: 0 }],
    });
    expect(again.status).toBe(409);
  });

  it("rejects answers for foreign questions", async () => {
    const created = (await api.post(`/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    })) as { status: number; json: { attemptId: number } };
    const other = await server.db.question.findFirstOrThrow({
      where: { subject: { name: "Physics" } },
    });
    const res = await api.post(`/tests/${created.json.attemptId}/submit`, {
      answers: [{ questionId: other.id, selectedIndex: 0 }],
    });
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toContain("not in this test");
  });

  it("counts unanswered as wrong in stats", async () => {
    const created = (await api.post(`/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    })) as { status: number; json: { attemptId: number; questions: { id: number }[] } };
    const attemptId = created.json.attemptId;
    const questionId = created.json.questions[0].id;
    await api.post(`/tests/${attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: null }],
    });
    const stat = await server.db.stat.findUniqueOrThrow({
      where: { userId_questionId: { userId, questionId } },
    });
    expect(stat.wrong).toBeGreaterThanOrEqual(1);
  });

  it("marks a late submit as expired but still scores it", async () => {
    const created = (await api.post(`/tests`, {
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
    const res = await api.post(`/tests/${attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: 0 }],
    });
    expect(res.status).toBe(200);
    expect((res.json as { expired: boolean }).expired).toBe(true);
    const result = (await api.get(`/tests/${attemptId}/result`)).json as {
      expired: boolean;
    };
    expect(result.expired).toBe(true);
  });

  describe("GET /tests/:id (restore in-progress)", () => {
    it("returns sanitized questions, deadline and serverNow", async () => {
      const created = (await api.post(`/tests`, {
        mode: "practice",
        subject: "Maths",
        count: 2,
      })) as { status: number; json: { attemptId: number } };
      const view = await api.get(`/tests/${created.json.attemptId}`);
      expect(view.status).toBe(200);
      const body = view.json as {
        attemptId: number;
        deadline: string;
        serverNow: string;
        questions: { id: number; text: string; options: string[] }[];
        saved: { questionId: number; selectedIndex: number | null }[];
      };
      expect(body.attemptId).toBe(created.json.attemptId);
      expect(Number.isNaN(Date.parse(body.deadline))).toBe(false);
      expect(Number.isNaN(Date.parse(body.serverNow))).toBe(false);
      expect(body.questions).toHaveLength(2);
      expect(body.saved).toHaveLength(2);
      expect(body.saved.every((s) => s.selectedIndex === null)).toBe(true);
      for (const q of body.questions) {
        expect(q).not.toHaveProperty("correctIndex");
        expect(q).not.toHaveProperty("explanation");
      }
    });

    it("returns 404 for a missing attempt", async () => {
      const res = await api.get(`/tests/99999`);
      expect(res.status).toBe(404);
      expect((res.json as { error: string }).error).toBe("Test not found.");
    });

    it("returns 409 after submission, pointing at the result", async () => {
      const created = (await api.post(`/tests`, {
        mode: "practice",
        subject: "Physics",
        count: 1,
      })) as { status: number; json: { attemptId: number; questions: { id: number }[] } };
      await api.post(`/tests/${created.json.attemptId}/submit`, {
        answers: [{ questionId: created.json.questions[0].id, selectedIndex: null }],
      });
      const res = await api.get(`/tests/${created.json.attemptId}`);
      expect(res.status).toBe(409);
      expect((res.json as { error: string }).error).toContain("already submitted");
      expect((res.json as { error: string }).error).toContain("result");
    });
  });
});
