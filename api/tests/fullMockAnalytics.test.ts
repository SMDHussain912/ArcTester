import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { bindSession, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let api: ReturnType<typeof bindSession>;
let studentId = 0;
let questionId = 0;

beforeAll(async () => {
  server = await startTestServer(buildApp);
  const session = await signUp(server.baseUrl, "full-mock-analytics@example.com");
  studentId = session.userId;
  api = bindSession(server.baseUrl, session.cookie);

  const subject = await server.db.subject.create({ data: { name: "Full Mock Analytics Subject" } });
  const topic = await server.db.topic.create({ data: { name: "Snapshot Topic", subjectId: subject.id } });
  const question = await server.db.question.create({
    data: {
      subjectId: subject.id,
      topicId: topic.id,
      text: "Full mock analytics fixture question?",
      options: JSON.stringify(["A", "B", "C", "D"]),
      correctIndex: 0,
      explanation: "Fixture",
      questionHash: "full-mock-analytics-fixture-question",
      reviewStatus: "APPROVED",
    },
  });
  questionId = question.id;

  const attempt = await server.db.attempt.create({
    data: { userId: studentId, mode: "mock", finishedAt: new Date(), startedAt: new Date(Date.now() - 180_000) },
  });
  await server.db.attemptAnswer.createMany({
    data: Array.from({ length: 200 }, (_, index) => {
      const math = index < 100;
      const unanswered = math && index % 5 === 0;
      const correct = math ? index % 4 === 0 && !unanswered : index % 5 < 3;
      return {
        attemptId: attempt.id,
        questionId,
        chosen: unanswered ? null : 0,
        isCorrect: correct,
        subjectSnapshot: math ? "Maths" : "CSE",
        topicSnapshot: math ? "Matrices" : "Data Structures",
        difficultySnapshot: "medium",
      };
    }),
  });

  const partialMock = await server.db.attempt.create({
    data: { userId: studentId, mode: "mock", finishedAt: new Date(), startedAt: new Date(Date.now() - 180_000) },
  });
  await server.db.attemptAnswer.createMany({
    data: Array.from({ length: 199 }, (_, index) => ({
      attemptId: partialMock.id,
      questionId,
      chosen: 0,
      isCorrect: index % 2 === 0,
      subjectSnapshot: "Partial",
      topicSnapshot: "Must not appear",
    })),
  });

  const practice = await server.db.attempt.create({
    data: { userId: studentId, mode: "practice", finishedAt: new Date(), startedAt: new Date(Date.now() - 60_000) },
  });
  await server.db.attemptAnswer.createMany({
    data: Array.from({ length: 200 }, (_, index) => ({
      attemptId: practice.id,
      questionId,
      chosen: 0,
      isCorrect: true,
      subjectSnapshot: "Practice only",
      topicSnapshot: "Must not appear",
    })),
  });
});

afterAll(async () => {
  await server.close();
});

describe("full mock subject/topic analytics", () => {
  it("aggregates only completed exact 200-question mocks and counts unanswered separately", async () => {
    const response = await api.get("/analytics/full-mock-performance");
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      completedFullMocks: 1,
      questionCount: 200,
      answeredQuestions: 180,
      correct: 80,
      incorrect: 100,
      unanswered: 20,
      accuracy: 80 / 180,
      subjects: [
        { subject: "CSE", questionCount: 100, answeredQuestions: 100, correct: 60, incorrect: 40, unanswered: 0, accuracy: 0.6 },
        { subject: "Maths", questionCount: 100, answeredQuestions: 80, correct: 20, incorrect: 60, unanswered: 20, accuracy: 0.25 },
      ],
      topics: expect.arrayContaining([
        { subject: "Maths", topic: "Matrices", questionCount: 100, answeredQuestions: 80, correct: 20, incorrect: 60, unanswered: 20, accuracy: 0.25 },
        { subject: "CSE", topic: "Data Structures", questionCount: 100, answeredQuestions: 100, correct: 60, incorrect: 40, unanswered: 0, accuracy: 0.6 },
      ]),
    });
    const report = response.json as { latestMockAt: string | null; topics: { subject: string }[] };
    expect(report.latestMockAt).toBeTruthy();
    expect(report.topics.some((row) => row.subject === "Partial")).toBe(false);
    expect(report.topics.some((row) => row.subject === "Practice only")).toBe(false);
  });
});
