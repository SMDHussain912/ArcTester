import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth.js";
import { buildApp } from "../src/index.js";
import { sessionCookie, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let adminCookie = "";
let studentCookie = "";
let secondStudentCookie = "";
let studentId = 0;
let examId = "";
let assignmentId = "";
let displayedCorrectIndex = 1;

async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${server.baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
}

async function createSession(email: string, role: "ADMIN" | "STUDENT"): Promise<string> {
  await server.db.user.create({
    data: { email, passwordHash: hashPassword("exam-test-password-123"), role },
  });
  const response = await fetch(`${server.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "exam-test-password-123" }),
  });
  return sessionCookie(response);
}

describe("versioned exam management", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    adminCookie = await createSession("exam-admin@arctester.test", "ADMIN");
    studentCookie = await createSession("exam-student@arctester.test", "STUDENT");
    secondStudentCookie = await createSession("other-student@arctester.test", "STUDENT");
    const student = await server.db.user.findUniqueOrThrow({
      where: { email: "exam-student@arctester.test" },
      select: { id: true },
    });
    studentId = student.id;

    const subject = await server.db.subject.create({ data: { name: "Computer Science" } });
    const topic = await server.db.topic.create({
      data: { name: "Data Structures", subjectId: subject.id },
    });
    await server.db.question.create({
      data: {
        subjectId: subject.id,
        topicId: topic.id,
        text: "Which structure follows FIFO?",
        options: JSON.stringify(["Stack", "Queue", "Tree", "Graph"]),
        correctIndex: 1,
        explanation: "A queue follows first-in, first-out order.",
        source: "Exam route test",
        difficulty: "easy",
        questionHash: "exam-route-question-fifo-unique",
      },
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("requires authentication and administrator role for exam creation", async () => {
    const anonymous = await request("/admin/exams", "POST", {});
    const student = await request("/admin/exams", "POST", {}, studentCookie);
    expect(anonymous.status).toBe(403);
    expect(student.status).toBe(403);
  });

  it("allows admins to add questions directly to the question bank", async () => {
    const payload = {
      subject: "Computer Networks",
      topic: "OSI Model",
      text: "Which OSI layer is responsible for routing packets? (admin-created)",
      options: ["Physical", "Network", "Session", "Presentation"],
      correctIndex: 1,
      explanation: "The network layer handles logical addressing and routing.",
      difficulty: "medium",
      source: "Admin question editor",
    };
    const created = await request("/admin/questions", "POST", payload, adminCookie);
    expect(created.status).toBe(201);
    expect((created.json.question as { subject: string }).subject).toBe("Computer Networks");

    const duplicate = await request("/admin/questions", "POST", payload, adminCookie);
    expect(duplicate.status).toBe(409);

    const student = await request("/admin/questions", "POST", payload, studentCookie);
    expect(student.status).toBe(403);

    const bank = await request("/admin/question-bank", "GET", undefined, adminCookie);
    expect(bank.status).toBe(200);
    expect((bank.json.questions as Array<{ text: string }>).some((item) => item.text === payload.text)).toBe(true);
  });

  it("creates a draft with immutable question snapshots and marking values", async () => {
    const question = await server.db.question.findFirstOrThrow();
    const response = await request(
      "/admin/exams",
      "POST",
      {
        title: "Offline Systems Test",
        description: "Initial exam package",
        instructions: "Choose one answer per question.",
        durationMinutes: 45,
        shuffleQuestions: true,
        shuffleOptions: true,
        questions: [{ questionId: question.id, marks: 2, negativeMarks: 0.5 }],
      },
      adminCookie
    );
    expect(response.status).toBe(201);
    const exam = response.json.exam as {
      id: string;
      status: string;
      versions: Array<{ version: number; _count: { questions: number } }>;
    };
    examId = exam.id;
    expect(exam.status).toBe("DRAFT");
    expect(exam.versions[0].version).toBe(1);
    expect(exam.versions[0]._count.questions).toBe(1);

    const snapshot = await server.db.examVersionQuestion.findFirstOrThrow();
    expect(snapshot.correctIndex).toBe(1);
    expect(snapshot.marks).toBe(2);
    expect(snapshot.negativeMarks).toBe(0.5);
  });

  it("does not expose a draft exam package or permit assignment before publishing", async () => {
    const assigned = await request(
      `/admin/exams/${examId}/assign`,
      "POST",
      { studentIds: [studentId] },
      adminCookie
    );
    expect(assigned.status).toBe(404);
  });

  it("publishes the exam and creates assignments idempotently", async () => {
    const published = await request(
      `/admin/exams/${examId}/publish`,
      "POST",
      {},
      adminCookie
    );
    expect(published.status).toBe(200);

    const body = { studentIds: [studentId] };
    const first = await request(`/admin/exams/${examId}/assign`, "POST", body, adminCookie);
    const second = await request(`/admin/exams/${examId}/assign`, "POST", body, adminCookie);
    expect(first.status).toBe(201);
    expect((first.json.assignments as unknown[])).toHaveLength(1);
    expect(second.status).toBe(201);
    expect(second.json.created).toBe(0);

    const assignment = await server.db.examAssignment.findFirstOrThrow({
      where: { studentId },
    });
    assignmentId = assignment.id;
  });

  it("delivers a student package without answer keys or explanations", async () => {
    const list = await request("/exams/assigned", "GET", undefined, studentCookie);
    expect(list.status).toBe(200);
    expect((list.json.assignments as unknown[])).toHaveLength(1);

    const packageResponse = await request(
      `/exams/assignments/${assignmentId}/package`,
      "GET",
      undefined,
      studentCookie
    );
    expect(packageResponse.status).toBe(200);
    const packageBody = packageResponse.json.package as {
      questions: Array<{ options: string[]; optionOrder: number[] }>;
    };
    expect(packageBody.questions).toHaveLength(1);
    expect(packageBody.questions[0].options).not.toContain(undefined);
    expect([...packageBody.questions[0].optionOrder].sort()).toEqual([0, 1, 2, 3]);
    displayedCorrectIndex = packageBody.questions[0].optionOrder.indexOf(1);
    expect(displayedCorrectIndex).toBeGreaterThanOrEqual(0);
    expect(packageResponse.json.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("blocks access to a published paper before its availability window", async () => {
    const availableFrom = new Date(Date.now() + 60 * 60 * 1000);
    await server.db.examAssignment.update({
      where: { id: assignmentId },
      data: { availableFrom },
    });
    const response = await request(
      `/exams/assignments/${assignmentId}/package`,
      "GET",
      undefined,
      studentCookie
    );
    expect(response.status).toBe(403);
    expect(response.json.error).toContain("not available yet");
    await server.db.examAssignment.update({
      where: { id: assignmentId },
      data: { availableFrom: null },
    });
  });

  it("prevents students from downloading another student's assignment", async () => {
    const response = await request(
      `/exams/assignments/${assignmentId}/package`,
      "GET",
      undefined,
      secondStudentCookie
    );
    expect(response.status).toBe(404);
  });

  it("scores offline submissions on the server and safely handles retries", async () => {
    const question = await server.db.examVersionQuestion.findFirstOrThrow();
    const startedAt = new Date(Date.now() - 60 * 1000).toISOString();
    const submittedAt = new Date().toISOString();
    const body = {
      attemptUuid: "4fbd8a4b-ff25-4ec6-8b93-8f46a3b8c2f1",
      startedAt,
      submittedAt,
      answers: [{ examQuestionId: question.id, selectedIndex: displayedCorrectIndex }],
    };

    const first = await request(
      `/exams/assignments/${assignmentId}/submission`,
      "POST",
      body,
      studentCookie
    );
    expect(first.status).toBe(201);
    const submission = first.json.submission as {
      id: string;
      status: string;
      score: number;
      maximumScore: number;
    };
    expect(submission.status).toBe("GRADED");
    expect(submission.score).toBe(2);
    expect(submission.maximumScore).toBe(2);

    const retry = await request(
      `/exams/assignments/${assignmentId}/submission`,
      "POST",
      body,
      studentCookie
    );
    expect(retry.status).toBe(200);
    expect(retry.json.duplicate).toBe(true);
    expect((retry.json.submission as { id: string }).id).toBe(submission.id);

    const conflictingRetry = await request(
      `/exams/assignments/${assignmentId}/submission`,
      "POST",
      { ...body, attemptUuid: "d4bd8a4b-ff25-4ec6-8b93-8f46a3b8c2f1" },
      studentCookie
    );
    expect(conflictingRetry.status).toBe(409);

    const result = await request(
      `/exams/assignments/${assignmentId}/result`,
      "GET",
      undefined,
      studentCookie
    );
    expect(result.status).toBe(200);
    const resultBody = result.json.result as {
      score: number;
      questions: Array<{ correctIndex: number; explanation: string; isCorrect: boolean }>;
    };
    expect(resultBody.score).toBe(2);
    expect(resultBody.questions[0].correctIndex).toBe(1);
    expect(resultBody.questions[0].explanation).toContain("first-in");
    expect(resultBody.questions[0].isCorrect).toBe(true);
  });

  it("shows administrator analytics and blocks student access", async () => {
    const question = await server.db.question.findUniqueOrThrow({
      where: { questionHash: "exam-route-question-fifo-unique" },
    });
    const secondStudent = await server.db.user.findUniqueOrThrow({
      where: { email: "other-student@arctester.test" },
      select: { id: true },
    });
    const thirdStudent = await server.db.user.create({
      data: { email: "third-student@arctester.test", passwordHash: "test-only", role: "STUDENT" },
    });
    const cohortIds = [studentId, studentId, secondStudent.id, secondStudent.id, thirdStudent.id];
    for (const userId of cohortIds) {
      await server.db.attempt.create({
        data: {
          userId,
          mode: "practice",
          startedAt: new Date(Date.now() - 60_000),
          finishedAt: new Date(),
          answers: {
            create: {
              questionId: question.id,
              chosen: 0,
              isCorrect: false,
              subjectSnapshot: "Computer Science",
              topicSnapshot: "Data Structures",
              difficultySnapshot: "easy",
            },
          },
        },
      });
    }
    const admin = await request("/admin/analytics/overview", "GET", undefined, adminCookie);
    expect(admin.status).toBe(200);
    const body = admin.json as {
      totals: { students: number; exams: number; assignments: number; submissions: number; averagePercentage: number | null };
      practice: {
        questionPerformance: {
          minimumAnswers: number;
          minimumStudents: number;
          weakAccuracyThreshold: number;
          insufficientSampleCount: number;
          questions: { questionId: number; sampleSize: number; uniqueStudents: number; sufficientData: boolean; weak: boolean }[];
        };
      };
      exams: { title: string; assigned: number; submitted: number; averagePercentage: number | null }[];
      recentSubmissions: {
        submissionId: string;
        studentId: number;
        studentEmail: string;
        examTitle: string;
        score: number | null;
      }[];
    };
    expect(body.totals.students).toBe(3);
    expect(body.totals.exams).toBe(1);
    expect(body.totals.assignments).toBe(1);
    expect(body.totals.submissions).toBe(1);
    expect(body.totals.averagePercentage).toBe(100);
    expect(body.practice.questionPerformance).toMatchObject({
      minimumAnswers: 5,
      minimumStudents: 3,
      weakAccuracyThreshold: 0.6,
      questions: [{
        questionId: question.id,
        sampleSize: 5,
        uniqueStudents: 3,
        sufficientData: true,
        weak: true,
      }],
    });
    expect(body.exams[0].title).toBe("Offline Systems Test");
    expect(body.exams[0].submitted).toBe(1);
    expect(body.recentSubmissions[0].studentEmail).toBe("exam-student@arctester.test");

    const submissionId = body.recentSubmissions[0].submissionId;
    const detail = await request(
      `/admin/submissions/${submissionId}`,
      "GET",
      undefined,
      adminCookie
    );
    expect(detail.status).toBe(200);
    expect(detail.json.submission.student.email).toBe("exam-student@arctester.test");
    expect(detail.json.submission.questions[0].correctIndex).toBe(1);
    expect(detail.json.submission.questions[0].selectedIndex).toBe(1);
    expect(detail.json.submission.questions[0].isCorrect).toBe(true);

    const student = await request("/admin/analytics/overview", "GET", undefined, studentCookie);
    expect(student.status).toBe(403);
    const forbiddenDetail = await request(
      `/admin/submissions/${submissionId}`,
      "GET",
      undefined,
      studentCookie
    );
    expect(forbiddenDetail.status).toBe(403);
  });

  it("prevents another student from reading a submission result", async () => {
    const response = await request(
      `/exams/assignments/${assignmentId}/result`,
      "GET",
      undefined,
      secondStudentCookie
    );
    expect(response.status).toBe(404);
  });

  it("keeps the published version snapshot unchanged when the source bank question changes", async () => {
    const question = await server.db.question.findFirstOrThrow();
    await server.db.question.update({
      where: { id: question.id },
      data: { text: "Changed source question text" },
    });
    const snapshot = await server.db.examVersionQuestion.findFirstOrThrow();
    expect(snapshot.text).toBe("Which structure follows FIFO?");
  });
});
