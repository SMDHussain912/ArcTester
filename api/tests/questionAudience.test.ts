import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashQuestion } from "../src/questions.js";
import { buildApp } from "../src/index.js";
import { bindSession, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let firstApi: ReturnType<typeof bindSession>;
let secondApi: ReturnType<typeof bindSession>;
let firstStudentId = 0;
let secondStudentId = 0;
let firstQuestionId = 0;
let secondQuestionId = 0;

async function createScopedQuestion(targetStudentId: number, text: string): Promise<number> {
  const subject = await server.db.subject.upsert({ where: { name: "Scoped Audience Test" }, update: {}, create: { name: "Scoped Audience Test" } });
  const topic = await server.db.topic.upsert({
    where: { subjectId_name: { subjectId: subject.id, name: "Targeted" } },
    update: {}, create: { subjectId: subject.id, name: "Targeted" },
  });
  const question = await server.db.question.create({
    data: {
      subjectId: subject.id, topicId: topic.id, text,
      options: JSON.stringify(["A", "B", "C", "D"]), correctIndex: 0,
      questionType: "mcq", promptData: "{}", answerData: "{}",
      explanation: "", source: "Audience scope test", difficulty: "easy",
      reviewStatus: "APPROVED", questionHash: hashQuestion(text),
      audienceScope: "STUDENTS", targetStudentIdsJson: JSON.stringify([targetStudentId]),
    },
  });
  return question.id;
}

describe("question audience enforcement", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const first = await signUp(server.baseUrl, "question-audience-first@example.test");
    const second = await signUp(server.baseUrl, "question-audience-second@example.test");
    firstStudentId = first.userId;
    secondStudentId = second.userId;
    firstApi = bindSession(server.baseUrl, first.cookie);
    secondApi = bindSession(server.baseUrl, second.cookie);
    await server.db.user.update({ where: { id: firstStudentId }, data: { collegeCode: "101", collegeName: "First Polytechnic", branchCode: "CM", branchName: "Computer Engineering" } });
    await server.db.user.update({ where: { id: secondStudentId }, data: { collegeCode: "202", collegeName: "Second Polytechnic", branchCode: "EC", branchName: "Electronics Engineering" } });
    firstQuestionId = await createScopedQuestion(firstStudentId, "Question visible only to first scoped student?");
    secondQuestionId = await createScopedQuestion(secondStudentId, "Question visible only to second scoped student?");
  });

  afterAll(async () => { await server.close(); });

  it("filters question bank counts and offline learning packages per student", async () => {
    const firstBank = await firstApi.get("/bank");
    const secondBank = await secondApi.get("/bank");
    expect(firstBank.status).toBe(200);
    expect(secondBank.status).toBe(200);
    const firstSubject = (firstBank.json as { subjects: Array<{ subject: string; count: number }> }).subjects.find((item) => item.subject === "Scoped Audience Test");
    const secondSubject = (secondBank.json as { subjects: Array<{ subject: string; count: number }> }).subjects.find((item) => item.subject === "Scoped Audience Test");
    expect(firstSubject?.count).toBe(1);
    expect(secondSubject?.count).toBe(1);

    const firstPackage = await firstApi.get("/learning/package");
    const secondPackage = await secondApi.get("/learning/package");
    const firstIds = (firstPackage.json as { questions: Array<{ id: number }> }).questions.map((question) => question.id);
    const secondIds = (secondPackage.json as { questions: Array<{ id: number }> }).questions.map((question) => question.id);
    expect(firstIds).toContain(firstQuestionId);
    expect(firstIds).not.toContain(secondQuestionId);
    expect(secondIds).toContain(secondQuestionId);
    expect(secondIds).not.toContain(firstQuestionId);
  });

  it("generates practice tests only from questions visible to that student", async () => {
    const first = await firstApi.post("/tests", { mode: "practice", subject: "Scoped Audience Test", count: 1 });
    const second = await secondApi.post("/tests", { mode: "practice", subject: "Scoped Audience Test", count: 1 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstIds = (first.json as { questions: Array<{ id: number }> }).questions.map((question) => question.id);
    const secondIds = (second.json as { questions: Array<{ id: number }> }).questions.map((question) => question.id);
    expect(firstIds).toContain(firstQuestionId);
    expect(firstIds).not.toContain(secondQuestionId);
    expect(secondIds).toContain(secondQuestionId);
    expect(secondIds).not.toContain(firstQuestionId);
  });
});
