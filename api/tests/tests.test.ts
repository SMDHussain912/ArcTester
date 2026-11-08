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

  it("builds a balanced paper from multiple selected subjects", async () => {
    const { status, json } = await api.post("/tests", {
      mode: "practice",
      subjects: ["Maths", "Physics"],
      count: 4,
    });
    expect(status).toBe(201);
    const body = json as { questions: { subject: string }[] };
    expect(body.questions).toHaveLength(4);
    expect(new Set(body.questions.map((question) => question.subject))).toEqual(new Set(["Maths", "Physics"]));
    expect(body.questions.filter((question) => question.subject === "Maths")).toHaveLength(3);
    expect(body.questions.filter((question) => question.subject === "Physics")).toHaveLength(1);
  });

  it("applies optional topic filters only after subject selection", async () => {
    const maths = await server.db.subject.findUniqueOrThrow({ where: { name: "Maths" } });
    const topic = await server.db.topic.upsert({
      where: { subjectId_name: { subjectId: maths.id, name: "Algebra" } },
      update: {},
      create: { subjectId: maths.id, name: "Algebra" },
    });
    const question = await server.db.question.findFirstOrThrow({ where: { subjectId: maths.id } });
    await server.db.question.update({ where: { id: question.id }, data: { topicId: topic.id } });

    const { status, json } = await api.post("/tests", {
      mode: "practice",
      subjects: ["Maths", "Physics"],
      topics: ["Algebra"],
      count: 10,
    });
    expect(status).toBe(201);
    const body = json as { questions: { subject: string; topic: string | null }[]; warnings: string[] };
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0]).toMatchObject({ subject: "Maths", topic: "Algebra" });
    expect(body.warnings[0]).toContain("only 1");
  });

  it("filters topic selections by both subject and topic name", async () => {
    const physics = await server.db.subject.findUniqueOrThrow({ where: { name: "Physics" } });
    const topic = await server.db.topic.upsert({
      where: { subjectId_name: { subjectId: physics.id, name: "Mechanics" } },
      update: {},
      create: { subjectId: physics.id, name: "Mechanics" },
    });
    const physicsQuestion = await server.db.question.findFirstOrThrow({ where: { subjectId: physics.id } });
    await server.db.question.update({ where: { id: physicsQuestion.id }, data: { topicId: topic.id } });

    const { status, json } = await api.post("/tests", {
      mode: "practice",
      subjects: ["Maths", "Physics"],
      topicFilters: [{ subject: "Maths", topic: "Algebra" }, { subject: "Physics", topic: "Algebra" }],
      count: 10,
    });
    expect(status).toBe(201);
    const body = json as { questions: { subject: string; topic: string | null }[] };
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.questions.every((question) => question.subject === "Maths" && question.topic === "Algebra")).toBe(true);
  });

  it("keeps all topics for selected subjects without a topic restriction", async () => {
    const maths = await server.db.subject.findUniqueOrThrow({ where: { name: "Maths" } });
    const physics = await server.db.subject.findUniqueOrThrow({ where: { name: "Physics" } });
    const algebra = await server.db.topic.upsert({
      where: { subjectId_name: { subjectId: maths.id, name: "Algebra" } },
      update: {},
      create: { subjectId: maths.id, name: "Algebra" },
    });
    const mechanics = await server.db.topic.upsert({
      where: { subjectId_name: { subjectId: physics.id, name: "Mechanics" } },
      update: {},
      create: { subjectId: physics.id, name: "Mechanics" },
    });
    const mathsQuestion = await server.db.question.findFirstOrThrow({ where: { subjectId: maths.id } });
    const physicsQuestion = await server.db.question.findFirstOrThrow({ where: { subjectId: physics.id } });
    await server.db.question.update({ where: { id: mathsQuestion.id }, data: { topicId: algebra.id } });
    await server.db.question.update({ where: { id: physicsQuestion.id }, data: { topicId: mechanics.id } });

    const { status, json } = await api.post("/tests", {
      mode: "practice",
      subjects: ["Maths", "Physics"],
      topicFilters: [{ subject: "Maths", topic: "Algebra" }],
      count: 10,
    });
    expect(status).toBe(201);
    const body = json as { questions: { subject: string; topic: string | null }[] };
    expect(body.questions).toContainEqual(expect.objectContaining({ subject: "Maths", topic: "Algebra" }));
    expect(body.questions).toContainEqual(expect.objectContaining({ subject: "Physics", topic: "Mechanics" }));
  });

  it("applies difficulty filters after subject and optional topic selection", async () => {
    const physics = await server.db.subject.findUniqueOrThrow({ where: { name: "Physics" } });
    await server.db.question.updateMany({ where: { subjectId: physics.id }, data: { difficulty: "easy" } });
    const { status, json } = await api.post("/tests", {
      mode: "practice",
      subjects: ["Maths", "Physics"],
      difficulty: "easy",
      count: 10,
    });
    expect(status).toBe(201);
    const body = json as { questions: { subject: string }[]; warnings: string[] };
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.questions.every((question) => question.subject === "Physics")).toBe(true);
    expect(body.warnings.some((warning) => warning.includes("Maths"))).toBe(true);
  });

  it("builds a review-mistakes paper across all subjects without requiring a subject", async () => {
    const maths = await server.db.question.findFirstOrThrow({ where: { subject: { name: "Maths" } } });
    const physics = await server.db.question.findFirstOrThrow({ where: { subject: { name: "Physics" } } });
    for (const question of [maths, physics]) {
      await server.db.stat.upsert({
        where: { userId_questionId: { userId, questionId: question.id } },
        update: { seen: 1, wrong: 1 },
        create: { userId, questionId: question.id, seen: 1, wrong: 1 },
      });
    }
    const { status, json } = await api.post("/tests", { mode: "mistakes", count: 10 });
    expect(status).toBe(201);
    const body = json as { questions: { id: number; subject: string }[] };
    expect(body.questions.map((question) => question.id)).toEqual(expect.arrayContaining([maths.id, physics.id]));
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
    const previousStat = await server.db.stat.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });
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
    expect(stat).toMatchObject({
      seen: (previousStat?.seen ?? 0) + 1,
      wrong: Math.max(0, (previousStat?.wrong ?? 0) - 1),
    });

    const again = await api.post(`/tests/${attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: 0 }],
    });
    expect(again.status).toBe(409);
  });

  it("keeps the original question wording, options and answer key after the bank question is edited", async () => {
    const created = (await api.post("/tests", {
      mode: "practice",
      subject: "Physics",
      count: 1,
    })) as { status: number; json: { attemptId: number; questions: { id: number }[] } };
    const questionId = created.json.questions[0].id;
    const original = await server.db.question.findUniqueOrThrow({ where: { id: questionId } });
    const originalOptions = JSON.parse(original.options) as string[];

    await server.db.question.update({
      where: { id: questionId },
      data: {
        text: "Edited after the attempt started",
        options: JSON.stringify(["new A", "new B", "new C", "new D"]),
        correctIndex: (original.correctIndex + 1) % 4,
        explanation: "New explanation",
      },
    });

    const submitted = await api.post(`/tests/${created.json.attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: original.correctIndex }],
    });
    expect(submitted.status).toBe(200);
    expect(submitted.json).toMatchObject({ score: 1, total: 1 });

    const result = await api.get(`/tests/${created.json.attemptId}/result`);
    expect(result.status).toBe(200);
    expect(result.json.questions[0]).toMatchObject({
      questionId,
      text: original.text,
      options: originalOptions,
      correctIndex: original.correctIndex,
      explanation: original.explanation,
      isCorrect: true,
    });
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

  it("prevents deleting questions referenced by student history", async () => {
    const created = (await api.post("/tests", {
      mode: "practice",
      subject: "Maths",
      count: 1,
    })) as { json: { attemptId: number; questions: { id: number }[] } };
    const questionId = created.json.questions[0].id;
    await expect(server.db.question.delete({ where: { id: questionId } })).rejects.toMatchObject({ code: "P2003" });
    expect(await server.db.question.findUnique({ where: { id: questionId } })).not.toBeNull();
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
