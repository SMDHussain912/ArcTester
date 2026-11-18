import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { importFromJson } from "../src/importService.js";
import { buildApp } from "../src/index.js";
import { bindSession, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let api: ReturnType<typeof bindSession>;
let attemptId = 0;
let questionId = 0;

beforeAll(async () => {
  vi.stubEnv("ARCTESTER_AI_API_KEY", "");
  vi.stubEnv("ARCTESTER_AI_BASE_URL", "");
  vi.stubEnv("ARCTESTER_AI_MODEL", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("ARCTESTER_LOCAL_AI_MODEL", "");
  server = await startTestServer(buildApp);
  await importFromJson(server.db, [
    ["Computer Science", "Which data structure follows LIFO?", ["Queue", "Stack", "Tree", "Graph"], 1, "A stack removes the most recently added item first."],
  ]);
  const session = await signUp(server.baseUrl, "answer-intelligence@example.com");
  api = bindSession(server.baseUrl, session.cookie);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await server.close();
});

describe("Answer Intelligence API", () => {
  it("keeps provider configuration status administrator-only", async () => {
    const response = await api.get("/admin/intelligence/status");
    expect(response.status).toBe(403);
  });

  it("only generates explanations for a question in the owner's completed attempt", async () => {
    const created = await api.post("/tests", { mode: "practice", subject: "Computer Science", count: 1 });
    expect(created.status).toBe(201);
    const paper = created.json as { attemptId: number; questions: { id: number }[] };
    attemptId = paper.attemptId;
    questionId = paper.questions[0].id;

    const submit = await api.post(`/tests/${attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: 0 }],
    });
    expect(submit.status).toBe(200);

    const explanation = await api.post(`/tests/${attemptId}/questions/${questionId}/explanation`, {});
    expect(explanation.status).toBe(200);
    expect(explanation.json).toMatchObject({
      ok: true,
      explanation: {
        answer: "Stack",
        provider: "question-bank",
        explanationStatus: "approved",
        answerKeyVerified: true,
        explanationVerified: false,
        learningDecision: { action: "review-topic", recommendedMode: "mistakes", questionCount: 5 },
      },
    });
  });

  it("does not reveal explanations for another user's attempt", async () => {
    const other = await signUp(server.baseUrl, "other-answer-intelligence@example.com");
    const otherApi = bindSession(server.baseUrl, other.cookie);
    const response = await otherApi.post(`/tests/${attemptId}/questions/${questionId}/explanation`, {});
    expect(response.status).toBe(404);
  });
});
