import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth.js";
import { buildApp } from "../src/index.js";
import { getJson, postJson, signIn, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let adminCookie = "";
let studentCookie = "";
let approvedId = 0;
let draftId = 0;
let rejectedId = 0;

async function patchJson(url: string, body: unknown, cookie: string) {
  const response = await fetch(url, { method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Record<string, unknown> };
}

describe("question review workflow and student approval boundary", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const admin = await server.db.user.create({ data: { email: "question-review-admin@example.test", passwordHash: hashPassword("correct-horse-battery"), role: "ADMIN" } });
    const student = await server.db.user.create({ data: { email: "question-review-student@example.test", passwordHash: hashPassword("correct-horse-battery"), role: "STUDENT" } });
    adminCookie = (await signIn(server.baseUrl, admin.email)).cookie;
    studentCookie = (await signIn(server.baseUrl, student.email)).cookie;
    const subject = await server.db.subject.create({ data: { name: "Mathematics" } });
    const topic = await server.db.topic.create({ data: { name: "Review Workflow", subjectId: subject.id } });
    const base = { subjectId: subject.id, topicId: topic.id, options: JSON.stringify(["Option A", "Option B", "Option C", "Option D"]), correctIndex: 1, explanation: "Test fixture explanation.", difficulty: "easy" };
    const approved = await server.db.question.create({ data: { ...base, text: "Review fixture approved question", source: "Verified review fixture source", reviewStatus: "APPROVED", questionHash: "review-fixture-approved" } });
    const draft = await server.db.question.create({ data: { ...base, text: "Review fixture draft question", source: "NEEDS HUMAN REVIEW", reviewStatus: "DRAFT", questionHash: "review-fixture-draft" } });
    const rejected = await server.db.question.create({ data: { ...base, text: "Review fixture rejected question", source: "NEEDS HUMAN REVIEW", reviewStatus: "REJECTED", questionHash: "review-fixture-rejected" } });
    approvedId = approved.id; draftId = draft.id; rejectedId = rejected.id;
  });

  afterAll(async () => { if (server) await server.close(); });

  it("exposes only approved questions in public bank counts and student practice", async () => {
    const bank = await getJson(server.baseUrl + "/bank");
    expect(bank.status).toBe(200);
    const maths = (bank.json as { subjects: Array<{ subject: string; count: number; practiceCount: number }> }).subjects.find((subject) => subject.subject === "Mathematics");
    expect(maths).toMatchObject({ count: 1, practiceCount: 1 });
    const practice = await postJson(server.baseUrl + "/tests", { mode: "practice", subject: "Mathematics", count: 10 }, studentCookie);
    expect(practice.status).toBe(201);
    const questions = (practice.json as { questions: Array<{ id: number }> }).questions;
    expect(questions.map((question) => question.id)).toEqual([approvedId]);
    expect(questions.some((question) => question.id === draftId || question.id === rejectedId)).toBe(false);
  });

  it("exports only approved questions in the student offline learning package", async () => {
    const response = await getJson(server.baseUrl + "/learning/package", studentCookie);
    expect(response.status).toBe(200);
    const questions = (response.json as { questions: Array<{ id: number }> }).questions;
    expect(questions.map((question) => question.id)).toEqual([approvedId]);
  });

  it("prevents unapproved questions from entering a new formal exam snapshot", async () => {
    const blocked = await postJson(server.baseUrl + "/admin/exams", { title: "Draft question must not enter exam", durationMinutes: 30, questions: [{ questionId: draftId, marks: 1, negativeMarks: 0 }] }, adminCookie);
    expect(blocked.status).toBe(400);
    expect(String((blocked.json as { error?: string }).error)).toContain("not approved");
    const accepted = await postJson(server.baseUrl + "/admin/exams", { title: "Approved question exam", durationMinutes: 30, questions: [{ questionId: approvedId, marks: 1, negativeMarks: 0 }] }, adminCookie);
    expect(accepted.status).toBe(201);
  });

  it("requires a real source before approving a question and allows the reviewer to add it", async () => {
    const missing = await patchJson(server.baseUrl + "/admin/questions/" + draftId + "/review", { status: "APPROVED" }, adminCookie);
    expect(missing.status).toBe(400);
    expect(String(missing.json.error)).toContain("real source");
    const approved = await patchJson(server.baseUrl + "/admin/questions/" + draftId + "/review", { status: "APPROVED", source: "Reviewer-supplied source for this test fixture" }, adminCookie);
    expect(approved.status).toBe(200);
    expect(approved.json.question).toMatchObject({ id: draftId, reviewStatus: "APPROVED" });
  });

  it("filters the admin queue by review status and reports subject quota progress", async () => {
    const queue = await getJson(server.baseUrl + "/admin/questions?reviewStatus=REJECTED&subject=Mathematics", adminCookie);
    expect(queue.status).toBe(200);
    expect((queue.json as { questions: Array<{ reviewStatus: string }> }).questions.every((question) => question.reviewStatus === "REJECTED")).toBe(true);
    const progress = await getJson(server.baseUrl + "/admin/question-review/progress", adminCookie);
    expect(progress.status).toBe(200);
    const maths = (progress.json as { subjects: Array<{ subject: string; paperQuota: number; requiredQuota: number; approved: number; drafted: number; rejected: number }> }).subjects.find((subject) => subject.subject === "Mathematics");
    expect(maths).toMatchObject({ paperQuota: 50, requiredQuota: 150, approved: 2, drafted: 0, rejected: 1 });
    expect((await getJson(server.baseUrl + "/admin/question-review/progress", studentCookie)).status).toBe(403);
  });

  it("bulk approval is atomic and refuses any question without a real source", async () => {
    const result = await patchJson(server.baseUrl + "/admin/questions/review/bulk", { ids: [draftId, rejectedId], status: "APPROVED", sources: [{ id: draftId, source: "Verified source for draft fixture" }] }, adminCookie);
    expect(result.status).toBe(400);
    expect(String(result.json.error)).toContain("every selected question");
    const [draft, rejected] = await Promise.all([server.db.question.findUniqueOrThrow({ where: { id: draftId } }), server.db.question.findUniqueOrThrow({ where: { id: rejectedId } })]);
    expect(draft.reviewStatus).toBe("APPROVED");
    expect(rejected.reviewStatus).toBe("REJECTED");
    const approved = await patchJson(server.baseUrl + "/admin/questions/review/bulk", { ids: [draftId, rejectedId], status: "APPROVED", sources: [{ id: draftId, source: "Verified source for draft fixture" }, { id: rejectedId, source: "Verified source for rejected fixture" }] }, adminCookie);
    expect(approved.status).toBe(200);
    expect(approved.json).toMatchObject({ ok: true, updated: 2, reviewStatus: "APPROVED" });
  });
});
