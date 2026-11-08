import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFromJson } from "../src/importService.js";
import { buildApp } from "../src/index.js";
import { bindSession, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let api: ReturnType<typeof bindSession>;
let questionId = 0;
let studentId = 0;

beforeAll(async () => {
  server = await startTestServer(buildApp);
  await importFromJson(server.db, [
    ["Prediction", "Prediction fixture question?", ["A", "B", "C", "D"], 0, "Fixture explanation"],
  ]);
  const question = await server.db.question.findFirstOrThrow();
  questionId = question.id;
  const session = await signUp(server.baseUrl, "prediction-student@example.com");
  studentId = session.userId;
  api = bindSession(server.baseUrl, session.cookie);

  for (let index = 0; index < 3; index += 1) {
    await server.db.attempt.create({
      data: {
        userId: studentId,
        mode: "practice",
        startedAt: new Date(Date.UTC(2026, 0, index + 1)),
        finishedAt: new Date(Date.UTC(2026, 0, index + 1, 1)),
        answers: {
          create: [{
            questionId,
            chosen: index % 2,
            isCorrect: index % 2 === 0,
          }],
        },
      },
    });
  }
});

afterAll(async () => {
  await server.close();
});

describe("student score prediction endpoint", () => {
  it("does not produce a prediction before the minimum history exists", async () => {
    const response = await api.get("/analytics/score-prediction");
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      status: "insufficient_data",
      completedAttempts: 3,
      availableSamples: 0,
      requiredSamples: 20,
      requiredCompletedAttempts: 23,
    });
  });

  it("keeps prediction history isolated to the authenticated student", async () => {
    const other = await signUp(server.baseUrl, "prediction-other@example.com");
    const otherApi = bindSession(server.baseUrl, other.cookie);
    const response = await otherApi.get("/analytics/score-prediction");
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      status: "insufficient_data",
      completedAttempts: 0,
      availableSamples: 0,
    });
  });
});
