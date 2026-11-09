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
    ...Array.from({ length: 10 }, (_, index) => [
      "Prediction",
      `Prediction fixture question ${index + 1}?`,
      ["A", "B", "C", "D"],
      0,
      "Fixture explanation",
    ]),
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
    expect(response.json.populationFeatures).toMatchObject({ completed_attempts: 3, previous_accuracy: 1, previous_question_count: 1 });
  });


  it("returns a ready prediction when a student's improving history beats the baseline", async () => {
    const learner = await signUp(server.baseUrl, "prediction-ready@example.com");
    const questionIds = (await server.db.question.findMany({
      orderBy: { id: "asc" },
      select: { id: true },
    })).map((question) => question.id);

    for (let index = 0; index < 30; index += 1) {
      const correctCount = 2 + Math.floor(index * 0.2);
      await server.db.attempt.create({
        data: {
          userId: learner.userId,
          mode: "practice",
          startedAt: new Date(Date.UTC(2026, 1, index + 1)),
          finishedAt: new Date(Date.UTC(2026, 1, index + 1, 1)),
          answers: {
            create: questionIds.map((id, questionIndex) => ({
              questionId: id,
              chosen: questionIndex < correctCount ? 0 : 1,
              isCorrect: questionIndex < correctCount,
            })),
          },
        },
      });
    }

    const learnerApi = bindSession(server.baseUrl, learner.cookie);
    const response = await learnerApi.get("/analytics/score-prediction");
    expect(response.status).toBe(200);
    expect(response.json.status).toBe("ready");
    expect(response.json).toMatchObject({
      completedAttempts: 30,
      trainingSamples: 27,
      evaluationSamples: 9,
    });
    expect(response.json.populationFeatures).toMatchObject({ completed_attempts: 30, previous_accuracy: 0.7, previous_question_count: 10 });
    expect(response.json.predictedScorePercent).toBeGreaterThanOrEqual(0);
    expect(response.json.predictedScorePercent).toBeLessThanOrEqual(100);
    expect(response.json.predictionInterval.lowerPercent).toBeGreaterThanOrEqual(0);
    expect(response.json.predictionInterval.upperPercent).toBeLessThanOrEqual(100);
    expect(response.json.predictionInterval.lowerPercent).toBeLessThanOrEqual(response.json.predictedScorePercent);
    expect(response.json.predictionInterval.upperPercent).toBeGreaterThanOrEqual(response.json.predictedScorePercent);
    expect(response.json.predictionInterval.estimatedErrorPercent).toBeGreaterThan(0);
    expect(response.json.predictionInterval.method).toBe("walk-forward-rmse");
    expect(response.json.modelMae).toBeLessThan(response.json.baselineMae);
  });

  it("withholds predictions when a constant history cannot beat the baseline", async () => {
    const learner = await signUp(server.baseUrl, "prediction-constant@example.com");
    const questionIds = (await server.db.question.findMany({
      orderBy: { id: "asc" },
      select: { id: true },
    })).map((question) => question.id);

    for (let index = 0; index < 30; index += 1) {
      await server.db.attempt.create({
        data: {
          userId: learner.userId,
          mode: "practice",
          startedAt: new Date(Date.UTC(2026, 3, index + 1)),
          finishedAt: new Date(Date.UTC(2026, 3, index + 1, 1)),
          answers: {
            create: questionIds.map((id, questionIndex) => ({
              questionId: id,
              chosen: questionIndex < 5 ? 0 : 1,
              isCorrect: questionIndex < 5,
            })),
          },
        },
      });
    }

    const learnerApi = bindSession(server.baseUrl, learner.cookie);
    const response = await learnerApi.get("/analytics/score-prediction");
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      status: "baseline_not_beaten",
      completedAttempts: 30,
      evaluationSamples: 9,
      modelMae: 0,
      baselineMae: 0,
    });
    expect(response.json).not.toHaveProperty("predictedScorePercent");
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
    expect(response.json).not.toHaveProperty("populationFeatures");
  });
});
