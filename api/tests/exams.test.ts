import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
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

async function loginExistingSession(email: string): Promise<string> {
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

  it("previews CSV and JSON question imports using the admin UI content contract without writing", async () => {
    const before = await server.db.question.count();
    const jsonContent = JSON.stringify([{
      subject: "Preview Subject",
      topic: "Preview Topic",
      text: "Preview-only JSON question for admin UI contract",
      options: ["A", "B", "C", "D"],
      correctIndex: 2,
      explanation: "Preview only",
      source: "Admin preview regression",
      difficulty: "easy",
    }]);
    const jsonPreview = await request("/admin/questions/import/preview", "POST", {
      format: "json",
      content: jsonContent,
    }, adminCookie);
    expect(jsonPreview.status).toBe(200);
    expect(jsonPreview.json.report).toMatchObject({ added: 1, duplicates: 0, total: 1, invalid: [] });

    const csvContent = [
      "subject,topic,text,optionA,optionB,optionC,optionD,correctIndex,explanation,source,difficulty",
      "Preview Subject,Preview Topic,Preview-only CSV question,A,B,C,D,1,Preview only,Admin preview regression,easy",
    ].join("\n");
    const csvPreview = await request("/admin/questions/import/preview", "POST", {
      format: "csv",
      content: csvContent,
    }, adminCookie);
    expect(csvPreview.status).toBe(200);
    expect(csvPreview.json.report).toMatchObject({ added: 1, duplicates: 0, total: 1, invalid: [] });
    expect(await server.db.question.count()).toBe(before);
  });

  it("rejects malformed JSON question import previews with a client error", async () => {
    const invalid = await request("/admin/questions/import/preview", "POST", {
      format: "json",
      content: "{not-json",
    }, adminCookie);
    expect(invalid.status).toBe(400);
    expect(invalid.json.error).toContain("not valid JSON");
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

  it("returns a conflict when bulk deletion targets a question used by an attempt", async () => {
    const question = await server.db.question.findFirstOrThrow({
      where: { text: "Which structure follows FIFO?" },
    });
    const attempt = await server.db.attempt.create({
      data: { userId: studentId, mode: "practice" },
    });
    await server.db.attemptAnswer.create({
      data: {
        attemptId: attempt.id,
        questionId: question.id,
        chosen: null,
        isCorrect: false,
        subjectSnapshot: "Computer Science",
        topicSnapshot: "Data Structures",
        difficultySnapshot: "easy",
        textSnapshot: question.text,
        optionsSnapshot: question.options,
        correctIndexSnapshot: question.correctIndex,
        explanationSnapshot: question.explanation,
      },
    });

    const deleted = await request("/admin/questions/bulk", "DELETE", { ids: [question.id] }, adminCookie);
    expect(deleted.status).toBe(409);
    expect((deleted.json.error as string)).toContain("already used");
    expect(await server.db.question.findUnique({ where: { id: question.id } })).not.toBeNull();
    await server.db.attemptAnswer.deleteMany({ where: { attemptId: attempt.id } });
    await server.db.attempt.delete({ where: { id: attempt.id } });
  });

  it("rejects out-of-range pagination on the active admin question list", async () => {
    const response = await request("/admin/questions?page=1000001", "GET", undefined, adminCookie);
    expect(response.status).toBe(400);
  });

  it("rejects non-integer question bank pagination", async () => {
    const response = await request("/admin/question-bank?page=1.5", "GET", undefined, adminCookie);
    expect(response.status).toBe(400);
  });

  it("validates paper duplicates, subject blueprint and difficulty balance", async () => {
    const question = await server.db.question.findFirstOrThrow();
    const duplicate = await request("/admin/exams/validate-paper", "POST", {
      durationMinutes: 60,
      questions: [
        { questionId: question.id, marks: 1, negativeMarks: 0 },
        { questionId: question.id, marks: 1, negativeMarks: 0 },
      ],
    }, adminCookie);
    expect(duplicate.status).toBe(200);
    expect(duplicate.json.valid).toBe(false);
    expect((duplicate.json.errors as string[]).join(" ")).toContain("Duplicate");
    const student = await request("/admin/exams/validate-paper", "POST", {
      durationMinutes: 60,
      questions: [{ questionId: question.id, marks: 1, negativeMarks: 0 }],
    }, studentCookie);
    expect(student.status).toBe(403);
  });

  it("rejects a paper where every question has zero marks", async () => {
    const question = await server.db.question.findFirstOrThrow();
    const response = await request("/admin/exams", "POST", {
      title: "Zero Mark Paper",
      description: "",
      instructions: "",
      durationMinutes: 30,
      shuffleQuestions: false,
      shuffleOptions: false,
      questions: [{ questionId: question.id, marks: 0, negativeMarks: 0 }],
    }, adminCookie);
    expect(response.status).toBe(400);
    expect((response.json.reasons as string[]).join(" ")).toContain("An exam must award more than zero total marks.");
  });

  it("rejects a paper where negative marks exceed correct-answer marks", async () => {
    const question = await server.db.question.findFirstOrThrow();
    const response = await request("/admin/exams", "POST", {
      title: "Invalid Marking Paper",
      description: "",
      instructions: "",
      durationMinutes: 30,
      shuffleQuestions: false,
      shuffleOptions: false,
      questions: [{ questionId: question.id, marks: 0.25, negativeMarks: 1 }],
    }, adminCookie);
    expect(response.status).toBe(400);
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
    const [first, second] = await Promise.all([
      request(`/admin/exams/${examId}/assign`, "POST", body, adminCookie),
      request(`/admin/exams/${examId}/assign`, "POST", body, adminCookie),
    ]);
    expect([first, second].every((response) => [200, 201].includes(response.status))).toBe(true);
    expect([first, second].filter((response) => response.json.created === 1)).toHaveLength(1);
    expect([first, second].filter((response) => response.json.created === 0)).toHaveLength(1);
    expect([first, second].filter((response) => response.status === 200)
      .every((response) => response.json.alreadyAssigned === true)).toBe(true);

    const assignment = await server.db.examAssignment.findFirstOrThrow({
      where: { studentId },
    });
    assignmentId = assignment.id;
    const assignmentNotices = await server.db.studentNotification.findMany({
      where: { userId: studentId, kind: "EXAM_ASSIGNMENT" },
    });
    expect(assignmentNotices).toHaveLength(1);
    expect(assignmentNotices[0]).toMatchObject({
      title: "New exam assigned",
      href: "/assignments",
      dedupeKey: `exam-assignment:${assignment.id}`,
    });
  });

  it("lists versioned exam details and restricts admin read endpoints to administrators", async () => {
    const list = await request("/admin/exams", "GET", undefined, adminCookie);
    expect(list.status).toBe(200);
    const listed = (list.json.exams as Array<{
      id: string;
      status: string;
      versions: Array<{ version: number; _count: { questions: number } }>;
    }>).find((item) => item.id === examId);
    expect(listed).toMatchObject({
      id: examId,
      status: "PUBLISHED",
      versions: [{ version: 1, _count: { questions: 1 } }],
    });

    const detail = await request(`/admin/exams/${examId}`, "GET", undefined, adminCookie);
    expect(detail.status).toBe(200);
    expect(detail.json.exam).toMatchObject({
      id: examId,
      version: {
        version: 1,
        durationMinutes: 45,
        questions: [{ marks: 2, negativeMarks: 0.5 }],
      },
    });

    const latest = await request(`/admin/exams/${examId}/latest-version`, "GET", undefined, adminCookie);
    expect(latest.status).toBe(200);
    expect(latest.json.exam).toMatchObject({
      id: examId,
      version: {
        version: 1,
        questions: [{
          subject: "Computer Science",
          topic: "Data Structures",
          text: "Which structure follows FIFO?",
          marks: 2,
          negativeMarks: 0.5,
        }],
      },
    });

    expect((await request("/admin/exams", "GET", undefined, studentCookie)).status).toBe(403);
    expect((await request(`/admin/exams/${examId}`, "GET", undefined, studentCookie)).status).toBe(403);
    expect((await request(`/admin/exams/${examId}/latest-version`, "GET", undefined, studentCookie)).status).toBe(403);
  });

  it("protects practice history while preserving immutable exam snapshots on question deletion", async () => {
    const usedQuestion = await server.db.question.findUniqueOrThrow({
      where: { questionHash: "exam-route-question-fifo-unique" },
    });
    await server.db.attempt.create({
      data: {
        userId: studentId,
        mode: "practice",
        startedAt: new Date(Date.now() - 60_000),
        finishedAt: new Date(),
        answers: {
          create: {
            questionId: usedQuestion.id,
            chosen: usedQuestion.correctIndex,
            isCorrect: true,
            subjectSnapshot: "Computer Science",
            topicSnapshot: "Data Structures",
            difficultySnapshot: "easy",
            textSnapshot: usedQuestion.text,
            optionsSnapshot: usedQuestion.options,
            correctIndexSnapshot: usedQuestion.correctIndex,
            explanationSnapshot: usedQuestion.explanation,
          },
        },
      },
    });
    const blocked = await request(`/admin/questions/${usedQuestion.id}`, "DELETE", undefined, adminCookie);
    expect(blocked.status).toBe(409);
    expect(await server.db.question.findUnique({ where: { id: usedQuestion.id } })).not.toBeNull();

    // Do not let this regression fixture affect the analytics sample-size
    // assertions later in this same integration suite.
    const historyAttempt = await server.db.attempt.findFirstOrThrow({
      where: { userId: studentId, answers: { some: { questionId: usedQuestion.id } } },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    await server.db.attemptAnswer.deleteMany({ where: { attemptId: historyAttempt.id } });
    await server.db.attempt.delete({ where: { id: historyAttempt.id } });

    const options = ["Snapshot A", "Snapshot B", "Snapshot C", "Snapshot D"];
    const source = await server.db.question.create({
      data: {
        subjectId: usedQuestion.subjectId,
        text: "Snapshot-only source question for deletion regression",
        options: JSON.stringify(options),
        correctIndex: 2,
        explanation: "The immutable snapshot must survive source deletion.",
        source: "test",
        difficulty: "easy",
        questionHash: "exam-route-question-delete-snapshot-unique",
      },
    });
    const created = await request("/admin/exams", "POST", {
      title: "Snapshot deletion safety regression",
      description: "Verify that source deletion preserves the immutable version.",
      instructions: "Choose the correct answer.",
      durationMinutes: 15,
      shuffleQuestions: false,
      shuffleOptions: false,
      questions: [{ questionId: source.id, marks: 2, negativeMarks: 0.5 }],
    }, adminCookie);
    expect(created.status).toBe(201);
    const snapshotExamId = (created.json.exam as { id: string }).id;
    const version = await server.db.examVersion.findFirstOrThrow({
      where: { examId: snapshotExamId },
    });

    const deleted = await request(`/admin/questions/${source.id}`, "DELETE", undefined, adminCookie);
    expect(deleted.status).toBe(200);
    expect(await server.db.question.findUnique({ where: { id: source.id } })).toBeNull();
    const snapshot = await server.db.examVersionQuestion.findFirstOrThrow({
      where: { examVersionId: version.id },
    });
    expect(snapshot).toMatchObject({
      sourceQuestionId: null,
      text: source.text,
      options: JSON.stringify(options),
      correctIndex: 2,
      explanation: source.explanation,
      marks: 2,
      negativeMarks: 0.5,
    });
    await server.db.exam.delete({ where: { id: snapshotExamId } });
  });

  describe("PostgreSQL formal exam lifecycle", () => {
    let fixture!: { examId: string; assignments: Array<{ id: string; studentId: number }>; studentIds: number[]; cookies: string[]; questionSnapshotId: string; lateAssignmentId?: string };
    const emails = ["lifecycle-a@arctester.test", "lifecycle-b@arctester.test", "lifecycle-c@arctester.test", "lifecycle-d@arctester.test", "lifecycle-race@arctester.test"];
    beforeAll(async () => {
      const question = await server.db.question.findFirstOrThrow({ where: { text: "Which structure follows FIFO?" } });
      const cookies = await Promise.all(emails.map((email) => createSession(email, "STUDENT")));
      const studentIds = await Promise.all(emails.map(async (email) => (await server.db.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id));
      const created = await request("/admin/exams", "POST", { title: "PostgreSQL lifecycle integration", description: "End-to-end verification", instructions: "Select the correct answer.", durationMinutes: 1, shuffleQuestions: false, shuffleOptions: false, questions: [{ questionId: question.id, marks: 2, negativeMarks: 0 }] }, adminCookie);
      expect(created.status).toBe(201);
      const examId = (created.json.exam as { id: string }).id;
      expect((await request("/admin/exams/" + examId + "/publish", "POST", {}, adminCookie)).status).toBe(200);
      const assigned = await request("/admin/exams/" + examId + "/assign", "POST", { studentIds }, adminCookie);
      expect(assigned.status).toBe(201);
      const assignments = assigned.json.assignments as Array<{ id: string; studentId: number }>;
      expect(assignments).toHaveLength(5);
      const snapshot = await server.db.examVersionQuestion.findFirstOrThrow({ where: { examVersion: { examId } } });
      fixture = { examId, assignments, studentIds, cookies, questionSnapshotId: snapshot.id };
    });
    afterAll(async () => {
      if (!fixture) return;
      const assignmentIds = fixture.assignments.map((item) => item.id);
      const cleanupAssignmentIds = fixture.lateAssignmentId ? [...assignmentIds, fixture.lateAssignmentId] : assignmentIds;
      await server.db.examSubmission.deleteMany({ where: { assignmentId: { in: cleanupAssignmentIds } } });
      await server.db.examSessionEvent.deleteMany({ where: { session: { assignmentId: { in: cleanupAssignmentIds } } } });
      await server.db.examSession.deleteMany({ where: { assignmentId: { in: cleanupAssignmentIds } } });
      await server.db.examAssignment.deleteMany({ where: { id: { in: cleanupAssignmentIds } } });
      await server.db.exam.delete({ where: { id: fixture.examId } });
      await server.db.user.deleteMany({ where: { id: { in: fixture.studentIds } } });
    });
    it("returns one server-authoritative session when two devices start the same assignment concurrently", async () => {
      const assignment = fixture.assignments.find((item) => item.studentId === fixture.studentIds[4])!;
      const firstDevice = fixture.cookies[4];
      const secondDevice = await loginExistingSession(emails[4]);
      const [first, second] = await Promise.all([
        request("/exams/assignments/" + assignment.id + "/session/start", "POST", {}, firstDevice),
        request("/exams/assignments/" + assignment.id + "/session/start", "POST", {}, secondDevice),
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const firstSession = first.json.session as { id: string; status: string; startedAt: string };
      const secondSession = second.json.session as { id: string; status: string; startedAt: string };
      expect(secondSession).toMatchObject({
        id: firstSession.id,
        status: "ACTIVE",
        startedAt: firstSession.startedAt,
      });
      expect(await server.db.examSession.count({ where: { assignmentId: assignment.id } })).toBe(1);
      expect(await server.db.examSessionEvent.count({
        where: { sessionId: firstSession.id, type: "SESSION_STARTED" },
      })).toBe(1);
    });

    it("keeps answer keys private and creates a server-authoritative session with heartbeat and autosave", async () => {
      const assignment = fixture.assignments[0]; const student = fixture.cookies[0];
      const packageResponse = await request("/exams/assignments/" + assignment.id + "/package", "GET", undefined, student);
      expect(packageResponse.status).toBe(200);
      const packageQuestion = (packageResponse.json.package as { questions: Array<Record<string, unknown>> }).questions[0];
      expect(packageQuestion.correctIndex).toBeUndefined(); expect(packageQuestion.explanation).toBeUndefined();
      const started = await request("/exams/assignments/" + assignment.id + "/session/start", "POST", {}, student);
      expect(started.status).toBe(200);
      const session = started.json.session as { id: string; startedAt: string; deadline: string };
      expect(Date.parse(session.deadline)).toBe(Date.parse(session.startedAt) + 60_000);
      expect((await request("/exams/assignments/" + assignment.id + "/session/heartbeat", "POST", { event: "HEARTBEAT" }, student)).status).toBe(200);
      const saved = await request("/exams/assignments/" + assignment.id + "/answers", "PUT", { revision: 0, answers: [{ examQuestionId: fixture.questionSnapshotId, selectedIndex: 1 }] }, student);
      expect(saved.status).toBe(200); expect(saved.json).toMatchObject({ revision: 1, savedCount: 1 });
    });
    it("holds the server deadline during pause, resumes with the pause duration, and rejects student invigilator actions", async () => {
      const assignment = fixture.assignments[0]; const student = fixture.cookies[0];
      const started = await request("/exams/assignments/" + assignment.id + "/session/start", "POST", {}, student);
      const session = started.json.session as { id: string; startedAt: string; deadline: string };
      const forbiddenAction = await request("/admin/exams/sessions/" + session.id + "/action", "POST", { action: "PAUSE", reason: "Unauthorized student action" }, student);
      expect(forbiddenAction.status).toBe(403);
      const missingReason = await request("/admin/exams/sessions/" + session.id + "/action", "POST", { action: "PAUSE" }, adminCookie);
      expect(missingReason.status).toBe(400);
      expect((await server.db.examSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("ACTIVE");
      const blankReason = await request("/admin/exams/sessions/" + session.id + "/action", "POST", { action: "PAUSE", reason: "   " }, adminCookie);
      expect(blankReason.status).toBe(400);
      expect((await request("/admin/exams/sessions/" + session.id + "/action", "POST", { action: "PAUSE", reason: "Lifecycle integration pause" }, adminCookie)).status).toBe(200);
      const paused = await server.db.examSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(paused.status).toBe("PAUSED");
      expect((await request("/exams/assignments/" + assignment.id + "/session/heartbeat", "POST", { event: "HEARTBEAT" }, student)).status).toBe(409);
      expect((await request("/admin/exams/sessions/" + session.id + "/action", "POST", { action: "RESUME", reason: "Lifecycle integration resume" }, adminCookie)).status).toBe(200);
      const resumed = await request("/exams/assignments/" + assignment.id + "/session/start", "POST", {}, student);
      expect(resumed.status).toBe(200);
      const pausedDuration = (await server.db.examSession.findUniqueOrThrow({ where: { id: session.id } })).pausedDurationMs;
      expect(Date.parse((resumed.json.session as { deadline: string }).deadline)).toBe(Date.parse(session.startedAt) + 60_000 + pausedDuration);
    });
    it("submits, grades once, returns the same result on duplicate submit, and isolates student records", async () => {
      const assignment = fixture.assignments[0]; const student = fixture.cookies[0];
      const started = await request("/exams/assignments/" + assignment.id + "/session/start", "POST", {}, student);
      const session = started.json.session as { startedAt: string };
      const body = { attemptUuid: "c9c79f5b-a1c3-4d65-9c75-0b37d7a98a10", startedAt: session.startedAt, submittedAt: new Date().toISOString(), answers: [{ examQuestionId: fixture.questionSnapshotId, selectedIndex: 1 }] };
      const submitted = await request("/exams/assignments/" + assignment.id + "/submission", "POST", body, student);
      expect(submitted.status).toBe(201);
      const submission = submitted.json.submission as { id: string; status: string; score: number; maximumScore: number };
      expect(submission).toMatchObject({ status: "GRADED", score: 2, maximumScore: 2 });
      const resultNotices = await server.db.studentNotification.findMany({
        where: { userId: assignment.studentId, kind: "EXAM_RESULT" },
      });
      expect(resultNotices).toHaveLength(1);
      expect(resultNotices[0]).toMatchObject({
        title: "Exam result available",
        href: `/assignments/${assignment.id}/result`,
        dedupeKey: `exam-submission:${submission.id}`,
      });
      const duplicate = await request("/exams/assignments/" + assignment.id + "/submission", "POST", body, student);
      expect(duplicate.status).toBe(200); expect(duplicate.json.duplicate).toBe(true);
      expect((duplicate.json.submission as { id: string }).id).toBe(submission.id);
      expect(await server.db.studentNotification.count({
        where: { userId: assignment.studentId, kind: "EXAM_RESULT" },
      })).toBe(1);
      const result = await request("/exams/assignments/" + assignment.id + "/result", "GET", undefined, student);
      expect(result.status).toBe(200); expect((result.json.result as { score: number }).score).toBe(2);
      expect((await request("/exams/assignments/" + assignment.id + "/answers", "GET", undefined, fixture.cookies[1])).status).toBe(404);
      expect((await request("/exams/assignments/" + assignment.id + "/result", "GET", undefined, fixture.cookies[1])).status).toBe(404);
    });
    it("rejects terminated and expired sessions, grades inside the grace window and reviews late submissions", async () => {
      const terminatedAssignment = fixture.assignments[2]; const terminatedStudent = fixture.cookies[2];
      const startedC = await request("/exams/assignments/" + terminatedAssignment.id + "/session/start", "POST", {}, terminatedStudent);
      const sessionC = (startedC.json.session as { id: string }).id;
      expect((await request("/admin/exams/sessions/" + sessionC + "/action", "POST", { action: "TERMINATE", reason: "Failure path" }, adminCookie)).status).toBe(200);
      expect((await request("/exams/assignments/" + terminatedAssignment.id + "/session/start", "POST", {}, terminatedStudent)).status).toBe(409);
      expect((await request("/exams/assignments/" + terminatedAssignment.id + "/session/heartbeat", "POST", { event: "HEARTBEAT" }, terminatedStudent)).status).toBe(409);
      const expiredAssignment = fixture.assignments[3]; const expiredStudent = fixture.cookies[3];
      const startedD = await request("/exams/assignments/" + expiredAssignment.id + "/session/start", "POST", {}, expiredStudent);
      const sessionD = (startedD.json.session as { id: string }).id;
      const expiredAt = new Date(Date.now() - 3 * 60_000);
      await server.db.examSession.update({ where: { id: sessionD }, data: { startedAt: expiredAt, lastHeartbeatAt: expiredAt } });
      expect((await request("/exams/assignments/" + expiredAssignment.id + "/session/heartbeat", "POST", { event: "HEARTBEAT" }, expiredStudent)).status).toBe(403);
      expect((await server.db.examSession.findUniqueOrThrow({ where: { id: sessionD } })).status).toBe("EXPIRED");
      const examVersion = await server.db.examVersion.findFirstOrThrow({
        where: { examId: fixture.examId },
        select: { durationMinutes: true },
      });
      const durationMs = examVersion.durationMinutes * 60_000;
      const graceAssignment = fixture.assignments[1];
      const graceStudent = fixture.cookies[1];
      const graceStarted = await request("/exams/assignments/" + graceAssignment.id + "/session/start", "POST", {}, graceStudent);
      const graceSessionId = (graceStarted.json.session as { id: string }).id;
      const withinGraceStartedAt = new Date(Date.now() - durationMs - 9_000);
      await server.db.examSession.update({
        where: { id: graceSessionId },
        data: { startedAt: withinGraceStartedAt, lastHeartbeatAt: new Date() },
      });
      const withinGraceBody = {
        attemptUuid: "c6b7d74c-4f7f-4dd9-a1f4-f0c1b3a1c5f1",
        startedAt: withinGraceStartedAt.toISOString(),
        submittedAt: new Date().toISOString(),
        answers: [{ examQuestionId: fixture.questionSnapshotId, selectedIndex: 1 }],
      };
      const withinGraceSubmit = await request("/exams/assignments/" + graceAssignment.id + "/submission", "POST", withinGraceBody, graceStudent);
      expect(withinGraceSubmit.status).toBe(201);
      expect((withinGraceSubmit.json.submission as { status: string; score: number | null }).status).toBe("GRADED");
      expect((withinGraceSubmit.json.submission as { score: number | null }).score).toBe(2);

      const lateCookie = await createSession("lifecycle-late@arctester.test", "STUDENT");
      const lateStudent = await server.db.user.findUniqueOrThrow({ where: { email: "lifecycle-late@arctester.test" }, select: { id: true } });
      fixture.studentIds.push(lateStudent.id);
      const lateAssignment = await server.db.examAssignment.create({ data: { examVersionId: (await server.db.examAssignment.findUniqueOrThrow({ where: { id: fixture.assignments[1].id }, select: { examVersionId: true } })).examVersionId, studentId: lateStudent.id, assignedById: (await server.db.user.findUniqueOrThrow({ where: { email: "exam-admin@arctester.test" }, select: { id: true } })).id } });
      fixture.lateAssignmentId = lateAssignment.id;
      const lateStarted = await request("/exams/assignments/" + lateAssignment.id + "/session/start", "POST", {}, lateCookie);
      const lateSession = lateStarted.json.session as { id: string; startedAt: string };
      const pastDeadline = new Date(Date.now() - durationMs - 11_000);
      await server.db.examSession.update({ where: { id: lateSession.id }, data: { startedAt: pastDeadline, lastHeartbeatAt: new Date() } });
      const lateBody = { attemptUuid: "b6b7d74c-4f7f-4dd9-a1f4-f0c1b3a1c5f0", startedAt: pastDeadline.toISOString(), submittedAt: new Date().toISOString(), answers: [{ examQuestionId: fixture.questionSnapshotId, selectedIndex: 1 }] };
      const lateSubmit = await request("/exams/assignments/" + lateAssignment.id + "/submission", "POST", lateBody, lateCookie);
      expect(lateSubmit.status).toBe(201);
      expect((lateSubmit.json.submission as { status: string }).status).toBe("REVIEW_REQUIRED");
      expect((await request("/exams/assignments/" + lateAssignment.id + "/result", "GET", undefined, lateCookie)).status).toBe(200);

    });
  });

  it("lists published papers in the student catalogue without exposing answer data", async () => {
    const catalog = await request("/exams/catalog", "GET", undefined, studentCookie);
    expect(catalog.status).toBe(200);
    const papers = catalog.json.catalog as Array<{ examId: string; assignment: { id: string } | null; questionCount: number }>;
    const paper = papers.find((item) => item.examId === examId);
    expect(paper).toBeTruthy();
    expect(paper?.assignment?.id).toBe(assignmentId);
    expect(paper?.questionCount).toBe(1);
    const anonymous = await request("/exams/catalog");
    expect(anonymous.status).toBe(403);
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
      questions: Array<Record<string, unknown> & { optionOrder: number[]; options: string[] }>;
    };
    expect(packageBody.questions).toHaveLength(1);
    expect(packageBody.questions[0].correctIndex).toBeUndefined();
    expect(packageBody.questions[0].explanation).toBeUndefined();
    expect(packageBody.questions[0].optionOrder).toHaveLength(4);
    displayedCorrectIndex = packageBody.questions[0].optionOrder.indexOf(1);
    expect(packageBody.questions[0].options).toEqual(
      packageBody.questions[0].optionOrder.map((index) => ["Stack", "Queue", "Tree", "Graph"][index])
    );
    expect(packageResponse.json.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("blocks downloading a published package before its start window", async () => {
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
    expect(String(response.json.error)).toContain("not available yet");
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

  it("saves assigned-exam answers on the server and restores them after a reload", async () => {
    const assignment = await server.db.examAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: { examVersionId: true },
    });
    const question = await server.db.examVersionQuestion.findFirstOrThrow({
      where: { examVersionId: assignment.examVersionId },
    });
    const started = await request(`/exams/assignments/${assignmentId}/session/start`, "POST", {}, studentCookie);
    expect(started.status).toBe(200);
    const empty = await request(`/exams/assignments/${assignmentId}/answers`, "GET", undefined, studentCookie);
    expect(empty.status).toBe(200);
    expect(empty.json.answers).toEqual([]);
    expect(empty.json.revision).toBe(0);
    const saved = await request(`/exams/assignments/${assignmentId}/answers`, "PUT", {
      revision: 0,
      answers: [{ examQuestionId: question.id, selectedIndex: 2 }],
    }, studentCookie);
    expect(saved.status).toBe(200);
    expect(saved.json).toMatchObject({ savedCount: 1, revision: 1 });
    const secondDeviceCookie = await loginExistingSession("exam-student@arctester.test");
    const staleSave = await request(`/exams/assignments/${assignmentId}/answers`, "PUT", {
      revision: 0,
      answers: [{ examQuestionId: question.id, selectedIndex: 0 }],
    }, secondDeviceCookie);
    expect(staleSave.status).toBe(409);

    const sessionId = (started.json.session as { id: string }).id;
    const originalStartedAt = (started.json.session as { startedAt: string }).startedAt;
    await server.db.examSession.update({ where: { id: sessionId }, data: { status: "INTERRUPTED" } });
    const reconnected = await request(`/exams/assignments/${assignmentId}/session/start`, "POST", {}, studentCookie);
    expect(reconnected.status).toBe(200);
    expect(reconnected.json.session).toMatchObject({ status: "ACTIVE", startedAt: originalStartedAt });

    const paused = await request(`/admin/exams/sessions/${sessionId}/action`, "POST", { action: "PAUSE", reason: "Verify paused sessions reject saves" }, adminCookie);
    expect(paused.status).toBe(200);
    const pausedSave = await request(`/exams/assignments/${assignmentId}/answers`, "PUT", {
      revision: 1,
      answers: [{ examQuestionId: question.id, selectedIndex: 0 }],
    }, studentCookie);
    expect(pausedSave.status).toBe(409);
    const beforePausedHeartbeat = await server.db.examSession.findUniqueOrThrow({ where: { id: sessionId } });
    const blockedHeartbeat = await request(
      `/exams/assignments/${assignmentId}/session/heartbeat`, "POST", { event: "HEARTBEAT" }, studentCookie,
    );
    expect(blockedHeartbeat.status).toBe(409);
    const afterPausedHeartbeat = await server.db.examSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(afterPausedHeartbeat.status).toBe("PAUSED");
    expect(afterPausedHeartbeat.heartbeatCount).toBe(beforePausedHeartbeat.heartbeatCount);
    expect(afterPausedHeartbeat.lastHeartbeatAt?.getTime()).toBe(beforePausedHeartbeat.lastHeartbeatAt?.getTime());
    const pausedState = await server.db.examSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(pausedState.answersRevision).toBe(1);
    const resumed = await request(`/admin/exams/sessions/${sessionId}/action`, "POST", { action: "RESUME", reason: "Resume after review" }, adminCookie);
    expect(resumed.status).toBe(200);

    const restored = await request(`/exams/assignments/${assignmentId}/answers`, "GET", undefined, studentCookie);
    expect(restored.status).toBe(200);
    expect(restored.json.revision).toBe(1);
    expect(restored.json.answers).toEqual([expect.objectContaining({ examQuestionId: question.id, selectedIndex: 2 })]);
    const staleSubmission = await request(`/exams/assignments/${assignmentId}/submission`, "POST", {
      revision: 0,
      attemptUuid: "b8b5e7f0-4d22-4d71-92f0-9b6b5b8b1202",
      startedAt: started.json.session.startedAt,
      submittedAt: new Date().toISOString(),
      answers: [{ examQuestionId: question.id, selectedIndex: 2 }],
    }, secondDeviceCookie);
    expect(staleSubmission.status).toBe(409);
    const foreign = await request(`/exams/assignments/${assignmentId}/answers`, "GET", undefined, secondStudentCookie);
    expect(foreign.status).toBe(404);
    const invalid = await request(`/exams/assignments/${assignmentId}/answers`, "PUT", {
      answers: [{ examQuestionId: "not-in-this-exam", selectedIndex: 0 }],
    }, studentCookie);
    expect(invalid.status).toBe(400);
  });

  it("scores offline submissions on the server and safely handles retries", async () => {
    const question = await server.db.examVersionQuestion.findFirstOrThrow();
    const started = await request(
      `/exams/assignments/${assignmentId}/session/start`,
      "POST",
      {},
      studentCookie
    );
    expect(started.status).toBe(200);
    const sessionInfo = started.json.session as { startedAt: string };
    const heartbeat = await request(
      `/exams/assignments/${assignmentId}/session/heartbeat`,
      "POST",
      { event: "HEARTBEAT" },
      studentCookie
    );
    expect(heartbeat.status).toBe(200);
    const live = await request("/admin/exams/live-sessions", "GET", undefined, adminCookie);
    expect(live.status).toBe(200);
    expect((live.json.sessions as Array<{ assignmentId: string }>).some((item) => item.assignmentId === assignmentId)).toBe(true);
    const liveSessions = live.json.sessions as Array<{ id: string; assignmentId: string }>;
    const activeSession = liveSessions.find((item) => item.assignmentId === assignmentId)!;
    const paused = await request(`/admin/exams/sessions/${activeSession.id}/action`, "POST", { action: "PAUSE", reason: "Test pause" }, adminCookie);
    expect(paused.status).toBe(200);
    const firstPausedState = await server.db.examSession.findUniqueOrThrow({ where: { id: activeSession.id } });
    const firstPausedAt = firstPausedState.pausedAt?.getTime();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const repeatedPause = await request(`/admin/exams/sessions/${activeSession.id}/action`, "POST", { action: "PAUSE", reason: "Repeated pause should not reset the timer." }, adminCookie);
    expect(repeatedPause.status).toBe(200);
    const repeatedPausedState = await server.db.examSession.findUniqueOrThrow({ where: { id: activeSession.id } });
    expect(repeatedPausedState.pausedAt?.getTime()).toBe(firstPausedAt);
    const blockedResume = await request(`/exams/assignments/${assignmentId}/session/start`, "POST", {}, studentCookie);
    expect(blockedResume.status).toBe(409);
    const blockedSubmission = await request(`/exams/assignments/${assignmentId}/submission`, "POST", {
      attemptUuid: "7a2b8d1c-3e4f-4a5b-9c6d-7e8f90123456",
      startedAt: sessionInfo.startedAt,
      submittedAt: new Date().toISOString(),
      answers: [{ examQuestionId: question.id, selectedIndex: displayedCorrectIndex }],
    }, studentCookie);
    expect(blockedSubmission.status).toBe(409);
    expect(await server.db.examSubmission.findUnique({ where: { assignmentId } })).toBeNull();
    expect((await server.db.examSession.findUniqueOrThrow({ where: { id: activeSession.id } })).status).toBe("PAUSED");
    const resumed = await request(`/admin/exams/sessions/${activeSession.id}/action`, "POST", { action: "RESUME", reason: "Resume after review" }, adminCookie);
    expect(resumed.status).toBe(200);
    const resumedHeartbeat = await request(`/exams/assignments/${assignmentId}/session/heartbeat`, "POST", { event: "HEARTBEAT" }, studentCookie);
    expect(resumedHeartbeat.status).toBe(200);
    const startedAt = sessionInfo.startedAt;
    const submittedAt = new Date().toISOString();
    const body = {
      attemptUuid: "4fbd8a4b-ff25-4ec6-8b93-8f46a3b8c2f1",
      startedAt,
      submittedAt,
      answers: [{ examQuestionId: question.id, selectedIndex: displayedCorrectIndex }],
    };

    const [first, concurrent] = await Promise.all([
      request(`/exams/assignments/${assignmentId}/submission`, "POST", body, studentCookie),
      request(`/exams/assignments/${assignmentId}/submission`, "POST", body, studentCookie),
    ]);
    expect([first.status, concurrent.status].sort((left, right) => left - right)).toEqual([200, 201]);
    const winner = first.status === 201 ? first : concurrent;
    const duplicate = first.status === 200 ? first : concurrent;
    expect(duplicate.json.duplicate).toBe(true);
    const submission = winner.json.submission as {
      id: string;
      status: string;
      score: number;
      maximumScore: number;
    };
    expect(await server.db.examSubmission.count({ where: { assignmentId } })).toBe(1);
    expect((duplicate.json.submission as { id: string }).id).toBe(submission.id);
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

  it("preserves elapsed pause duration when an invigilator terminates a paused session", async () => {
    const assignment = await server.db.examAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: { examVersionId: true },
    });
    const admin = await server.db.user.findUniqueOrThrow({
      where: { email: "exam-admin@arctester.test" },
      select: { id: true },
    });
    const cookie = await createSession("terminate-paused@arctester.test", "STUDENT");
    const student = await server.db.user.findUniqueOrThrow({
      where: { email: "terminate-paused@arctester.test" },
      select: { id: true },
    });
    const extraAssignment = await server.db.examAssignment.create({
      data: { examVersionId: assignment.examVersionId, studentId: student.id, assignedById: admin.id },
    });
    const started = await request(`/exams/assignments/${extraAssignment.id}/session/start`, "POST", {}, cookie);
    expect(started.status).toBe(200);
    const session = started.json.session as { id: string };
    const paused = await request(`/admin/exams/sessions/${session.id}/action`, "POST", { action: "PAUSE", reason: "Pause for termination test" }, adminCookie);
    expect(paused.status).toBe(200);

    const pausedAt = new Date(Date.now() - 5 * 60 * 1000);
    await server.db.examSession.update({
      where: { id: session.id },
      data: { pausedAt, pausedDurationMs: 1000 },
    });
    const terminated = await request(`/admin/exams/sessions/${session.id}/action`, "POST", { action: "TERMINATE", reason: "Candidate session ended" }, adminCookie);
    expect(terminated.status).toBe(200);
    const finalState = await server.db.examSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(finalState.status).toBe("TERMINATED");
    expect(finalState.pausedAt).toBeNull();
    expect(finalState.endedAt).not.toBeNull();
    expect(finalState.pausedDurationMs).toBeGreaterThanOrEqual(301000);

    // Keep this regression fixture isolated from later tests that assert global counts.
    await server.db.user.delete({ where: { id: student.id } });
  });

  it("paginates admin student lists and supports email search", async () => {
    await server.db.user.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        email: `page-student-${String(index).padStart(2, "0")}@arctester.test`,
        passwordHash: "test-hash", role: "STUDENT",
      })),
    });
    const first = await request("/admin/students?page=1&limit=25", "GET", undefined, adminCookie);
    expect(first.status).toBe(200);
    expect(first.json.students).toHaveLength(25);
    expect(first.json).toMatchObject({ page: 1, limit: 25, total: 57, totalPages: 3 });
    const filtered = await request("/admin/students?page=1&limit=25&search=page-student-54", "GET", undefined, adminCookie);
    expect((filtered.json.students as Array<{ email: string }>).map((student) => student.email)).toEqual(["page-student-54@arctester.test"]);
  });

  it("returns paginated review-required submissions", async () => {
    const response = await request("/admin/submissions/review-required?page=1&limit=10", "GET", undefined, adminCookie);
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ page: 1, limit: 10 });
    expect((response.json.submissions as unknown[]).length).toBeLessThanOrEqual(10);
    expect(response.json.total).toBe(await server.db.examSubmission.count({ where: { status: "REVIEW_REQUIRED" } }));
  });

  it("returns exam attendance and question-level report data", async () => {
    const report = await request(`/admin/exams/${examId}/report`, "GET", undefined, adminCookie);
    expect(report.status).toBe(200);
    const data = report.json.report as { assigned: number; submitted: number; questions: Array<{ correct: number; responses: number }> };
    expect(data.assigned).toBe(1);
    expect(data.submitted).toBe(1);
    expect(data.questions[0]).toMatchObject({ correct: 1, responses: 1 });

    const audit = await request(`/admin/exams/assignments/${assignmentId}/audit`, "GET", undefined, adminCookie);
    expect(audit.status).toBe(200);
    const auditBody = audit.json.audit as { events: Array<{ type: string; actor: { email: string } | null }> };
    expect(auditBody.events.some((event) => event.type === "INVIGILATOR_PAUSE" && event.actor?.email === "exam-admin@arctester.test")).toBe(true);
    expect(auditBody.events.some((event) => event.type === "SUBMITTED" && event.actor?.email === "exam-student@arctester.test")).toBe(true);
    const student = await request(`/admin/exams/${examId}/report`, "GET", undefined, studentCookie);
    expect(student.status).toBe(403);

    const secondStudent = await server.db.user.findUniqueOrThrow({
      where: { email: "other-student@arctester.test" },
      select: { id: true },
    });
    const notStartedAssignment = await request(
      `/admin/exams/${examId}/assign`,
      "POST",
      { studentIds: [secondStudent.id] },
      adminCookie,
    );
    expect(notStartedAssignment.status).toBe(201);
    const unstartedId = (notStartedAssignment.json.assignments as Array<{ id: string }>)[0].id;

    const attendance = await request("/admin/exams/attendance", "GET", undefined, adminCookie);
    expect(attendance.status).toBe(200);
    const rows = attendance.json.attendance as Array<{
      assignmentId: string;
      attendanceStatus: string;
      connectivity: string;
      session: unknown;
      submission: unknown;
    }>;
    expect(rows.find((item) => item.assignmentId === assignmentId)?.attendanceStatus).toBe("SUBMITTED");
    expect(rows.find((item) => item.assignmentId === unstartedId)).toMatchObject({
      assignmentId: unstartedId,
      attendanceStatus: "NOT_STARTED",
      connectivity: "NOT_STARTED",
      session: null,
      submission: null,
    });

    // Keep the shared fixture isolated for later tests that create their own
    // assignment for this student and exam version.
    await server.db.studentNotification.deleteMany({
      where: { userId: secondStudent.id, dedupeKey: `exam-assignment:${unstartedId}` },
    });
    await server.db.examAssignment.delete({ where: { id: unstartedId } });
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
    expect(body.totals.students).toBe(58);
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

  it("handles concurrent duplicate assignment requests without creating duplicate rows or returning server errors", async () => {
    const thirdStudent = await server.db.user.findUniqueOrThrow({
      where: { email: "third-student@arctester.test" },
      select: { id: true },
    });
    const body = { studentIds: [thirdStudent.id] };
    const responses = await Promise.all([
      request(`/admin/exams/${examId}/assign`, "POST", body, adminCookie),
      request(`/admin/exams/${examId}/assign`, "POST", body, adminCookie),
    ]);

    expect(responses.every((response) => response.status === 200 || response.status === 201 || response.status === 409)).toBe(true);
    expect(responses.some((response) => response.status === 201)).toBe(true);
    const idempotentRetry = responses.find((response) => response.status === 200);
    if (idempotentRetry) expect(idempotentRetry.json.alreadyAssigned).toBe(true);
    expect(await server.db.examAssignment.count({
      where: { examVersion: { examId }, studentId: thirdStudent.id },
    })).toBe(1);
  });

  it("accepts a queued offline submission when no live server session was created", async () => {
    const version = await server.db.examVersion.findFirstOrThrow({
      where: { examId },
      orderBy: { version: "desc" },
    });
    const secondStudent = await server.db.user.findUniqueOrThrow({
      where: { email: "other-student@arctester.test" },
      select: { id: true },
    });
    const offlineAssignment = await server.db.examAssignment.create({
      data: {
        examVersionId: version.id,
        studentId: secondStudent.id,
        assignedById: (await server.db.user.findUniqueOrThrow({
          where: { email: "exam-admin@arctester.test" },
          select: { id: true },
        })).id,
      },
    });
    const question = await server.db.examVersionQuestion.findFirstOrThrow({
      where: { examVersionId: version.id },
    });
    const startedAt = new Date().toISOString();
    const submitted = await request(
      `/exams/assignments/${offlineAssignment.id}/submission`,
      "POST",
      {
        attemptUuid: "8d4bd8a4-ff25-4ec6-8b93-8f46a3b8c2f1",
        startedAt,
        submittedAt: new Date().toISOString(),
        answers: [{ examQuestionId: question.id, selectedIndex: null }],
      },
      secondStudentCookie
    );
    expect(submitted.status).toBe(201);
    const submission = submitted.json.submission as { id: string; status: string };
    expect(submission.status).toBe("REVIEW_REQUIRED");
    const heldResult = await request(`/exams/assignments/${offlineAssignment.id}/result`, "GET", undefined, secondStudentCookie);
    expect(heldResult.status).toBe(200);
    expect(heldResult.json.result).toMatchObject({ score: null, maximumScore: null, questions: [] });
    const concurrentReleases = await Promise.all([
      request(`/admin/submissions/${submission.id}/release`, "POST", {}, adminCookie),
      request(`/admin/submissions/${submission.id}/release`, "POST", {}, adminCookie),
    ]);
    expect(concurrentReleases.map((response) => response.status)).toEqual([200, 200]);
    expect(concurrentReleases.filter((response) => response.json.alreadyReleased === true)).toHaveLength(1);
    const releasedNotices = await server.db.studentNotification.findMany({
      where: { userId: secondStudent.id, dedupeKey: `exam-review-release:${submission.id}` },
    });
    expect(releasedNotices).toHaveLength(1);
    expect(releasedNotices[0]).toMatchObject({
      kind: "EXAM_RESULT",
      title: "Exam result available",
      href: `/assignments/${offlineAssignment.id}/result`,
    });
    const retiredReviewNotice = await server.db.studentNotification.findFirstOrThrow({
      where: { userId: secondStudent.id, dedupeKey: `exam-submission:${submission.id}` },
    });
    expect(retiredReviewNotice).toMatchObject({ kind: "EXAM_REVIEW", readAt: expect.any(Date) });
    const repeatedRelease = await request(`/admin/submissions/${submission.id}/release`, "POST", {}, adminCookie);
    expect(repeatedRelease.status).toBe(200);
    expect(repeatedRelease.json).toMatchObject({ alreadyReleased: true });
    expect(await server.db.studentNotification.count({
      where: { userId: secondStudent.id, dedupeKey: `exam-review-release:${submission.id}` },
    })).toBe(1);
    const availableResult = await request(`/exams/assignments/${offlineAssignment.id}/result`, "GET", undefined, secondStudentCookie);
    expect(availableResult.status).toBe(200);
    expect((availableResult.json.result as { questions: unknown[] }).questions).toHaveLength(1);
    const session = await server.db.examSession.findUniqueOrThrow({
      where: { assignmentId: offlineAssignment.id },
      include: { events: true },
    });
    expect(session.events.some((event) => event.type === "OFFLINE_SESSION_RECONCILED")).toBe(true);
  });

  it("releases many held submissions in one audited bulk action", async () => {
    const question = await server.db.question.findFirstOrThrow();
    const created = await request(
      "/admin/exams",
      "POST",
      {
        title: "Bulk Release Test",
        description: "",
        instructions: "",
        durationMinutes: 45,
        shuffleQuestions: false,
        shuffleOptions: false,
        questions: [{ questionId: question.id, marks: 2, negativeMarks: 0 }],
      },
      adminCookie
    );
    expect(created.status).toBe(201);
    const exam = created.json.exam as { id: string };
    const published = await request(`/admin/exams/${exam.id}/publish`, "POST", {}, adminCookie);
    expect(published.status).toBe(200);

    const heldSubmissionIds: string[] = [];
    for (const email of ["exam-student@arctester.test", "other-student@arctester.test"]) {
      const student = await server.db.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
      const assigned = await request(
        `/admin/exams/${exam.id}/assign`,
        "POST",
        { studentIds: [student.id] },
        adminCookie
      );
      expect([200, 201].includes(assigned.status)).toBe(true);
      const assignment = await server.db.examAssignment.findFirstOrThrow({
        where: { studentId: student.id, examVersion: { examId: exam.id } },
      });
      const versionQuestion = await server.db.examVersionQuestion.findFirstOrThrow({
        where: { examVersionId: assignment.examVersionId },
      });
      const cookie = await loginExistingSession(email);
      const submitted = await request(
        `/exams/assignments/${assignment.id}/submission`,
        "POST",
        {
          attemptUuid: randomUUID(),
          startedAt: new Date().toISOString(),
          submittedAt: new Date().toISOString(),
          answers: [{ examQuestionId: versionQuestion.id, selectedIndex: null }],
        },
        cookie
      );
      expect(submitted.status).toBe(201);
      heldSubmissionIds.push((submitted.json.submission as { id: string }).id);
    }

    const bulk = await request("/admin/submissions/release-bulk", "POST", { submissionIds: heldSubmissionIds }, adminCookie);
    expect(bulk.status).toBe(200);
    expect(Array.isArray(bulk.json.results)).toBe(true);
    expect(bulk.json.results.map((result: { status: string }) => result.status)).toEqual([
      "released",
      "released",
    ]);

    const remaining = await server.db.examSubmission.count({ where: { status: "REVIEW_REQUIRED" } });
    expect(remaining).toBe(0);

    const again = await request("/admin/submissions/release-bulk", "POST", { submissionIds: heldSubmissionIds }, adminCookie);
    expect(again.status).toBe(200);
    expect(again.json.results.map((result: { status: string }) => result.status)).toEqual([
      "already-released",
      "already-released",
    ]);
  });

  it("rejects invalid offline answers without creating a session", async () => {
    const version = await server.db.examVersion.findFirstOrThrow({
      where: { examId },
      orderBy: { version: "desc" },
    });
    const invalidStudentCookie = await createSession("invalid-offline-answer@arctester.test", "STUDENT");
    const invalidStudent = await server.db.user.findUniqueOrThrow({
      where: { email: "invalid-offline-answer@arctester.test" },
      select: { id: true },
    });
    const admin = await server.db.user.findUniqueOrThrow({
      where: { email: "exam-admin@arctester.test" },
      select: { id: true },
    });
    const invalidAssignment = await server.db.examAssignment.create({
      data: { examVersionId: version.id, studentId: invalidStudent.id, assignedById: admin.id },
    });

    const rejected = await request(
      `/exams/assignments/${invalidAssignment.id}/submission`,
      "POST",
      {
        attemptUuid: "9d4bd8a4-ff25-4ec6-8b93-8f46a3b8c2f1",
        startedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        answers: [{ examQuestionId: "not-in-this-exam", selectedIndex: 0 }],
      },
      invalidStudentCookie
    );

    expect(rejected.status).toBe(400);
    expect(await server.db.examSession.findUnique({
      where: { assignmentId: invalidAssignment.id },
    })).toBeNull();
  });

  it("does not leave an offline session when its attempt UUID was already used", async () => {
    const version = await server.db.examVersion.findFirstOrThrow({
      where: { examId },
      orderBy: { version: "desc" },
    });
    const duplicateStudentCookie = await createSession("duplicate-offline-attempt@arctester.test", "STUDENT");
    const duplicateStudent = await server.db.user.findUniqueOrThrow({
      where: { email: "duplicate-offline-attempt@arctester.test" },
      select: { id: true },
    });
    const admin = await server.db.user.findUniqueOrThrow({
      where: { email: "exam-admin@arctester.test" },
      select: { id: true },
    });
    const duplicateAssignment = await server.db.examAssignment.create({
      data: { examVersionId: version.id, studentId: duplicateStudent.id, assignedById: admin.id },
    });
    const question = await server.db.examVersionQuestion.findFirstOrThrow({
      where: { examVersionId: version.id },
    });

    const rejected = await request(
      `/exams/assignments/${duplicateAssignment.id}/submission`,
      "POST",
      {
        // This UUID was committed by the earlier online submission retry test.
        attemptUuid: "4fbd8a4b-ff25-4ec6-8b93-8f46a3b8c2f1",
        startedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        answers: [{ examQuestionId: question.id, selectedIndex: displayedCorrectIndex }],
      },
      duplicateStudentCookie
    );

    expect(rejected.status).toBe(409);
    expect(await server.db.examSubmission.findUnique({
      where: { assignmentId: duplicateAssignment.id },
    })).toBeNull();
    expect(await server.db.examSession.findUnique({
      where: { assignmentId: duplicateAssignment.id },
    })).toBeNull();
    await server.db.user.delete({ where: { id: duplicateStudent.id } });
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

  it("supports immutable exam version editing and cloning", async () => {
    const latest = await request(`/admin/exams/${examId}/latest-version`, "GET", undefined, adminCookie);
    expect(latest.status).toBe(200);
    const data = latest.json.exam as { version: { questions: Array<{ sourceQuestionId: number; marks: number; negativeMarks: number }> } };
    expect(data.version.questions).toHaveLength(1);
    const edited = await request(`/admin/exams/${examId}`, "PATCH", {
      title: "Offline Systems Test Revised",
      description: "Revised paper version",
      instructions: "Read carefully.",
      durationMinutes: 50,
      shuffleQuestions: false,
      shuffleOptions: false,
      questions: data.version.questions.map((question) => ({
        questionId: question.sourceQuestionId, marks: question.marks, negativeMarks: question.negativeMarks,
      })),
    }, adminCookie);
    expect(edited.status).toBe(200);
    expect((edited.json.exam as { versions: Array<{ version: number }> }).versions[0].version).toBe(2);

    const cloned = await request(`/admin/exams/${examId}/clone`, "POST", {}, adminCookie);
    expect(cloned.status).toBe(201);
    expect((cloned.json.exam as { title: string; status: string }).title).toContain("Copy of");
    expect((cloned.json.exam as { status: string }).status).toBe("DRAFT");
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
  it("retains deadline-crossing submissions for invigilator review", async () => {
    const sourceAssignment = await server.db.examAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
    const lateCandidateCookie = await createSession("late-candidate@arctester.test", "STUDENT");
    const lateCandidate = await server.db.user.findUniqueOrThrow({
      where: { email: "late-candidate@arctester.test" }, select: { id: true },
    });
    const admin = await server.db.user.findUniqueOrThrow({
      where: { email: "exam-admin@arctester.test" }, select: { id: true },
    });
    const lateAssignment = await server.db.examAssignment.create({
      data: {
        examVersionId: sourceAssignment.examVersionId,
        studentId: lateCandidate.id,
        assignedById: admin.id,
        dueAt: new Date(Date.now() + 60_000),
      },
    });
    const question = await server.db.examVersionQuestion.findFirstOrThrow({
      where: { examVersionId: sourceAssignment.examVersionId },
    });
    const started = await request(
      `/exams/assignments/${lateAssignment.id}/session/start`, "POST", {}, lateCandidateCookie,
    );
    expect(started.status).toBe(200);
    const session = started.json.session as { startedAt: string };
    const saved = await request(
      `/exams/assignments/${lateAssignment.id}/answers`, "PUT",
      { answers: [{ examQuestionId: question.id, selectedIndex: displayedCorrectIndex }] }, lateCandidateCookie,
    );
    expect(saved.status).toBe(200);
    await server.db.examAssignment.update({
      where: { id: lateAssignment.id }, data: { dueAt: new Date(Date.now() - 11_000) },
    });

    // Once the assignment deadline has passed, live access is blocked; submission remains accepted only after the 10-second grace expires.
    const expiredPackage = await request(
      `/exams/assignments/${lateAssignment.id}/package`, "GET", undefined, lateCandidateCookie,
    );
    expect(expiredPackage.status).toBe(403);
    const expiredStart = await request(
      `/exams/assignments/${lateAssignment.id}/session/start`, "POST", {}, lateCandidateCookie,
    );
    expect(expiredStart.status).toBe(403);
    const expiredSave = await request(
      `/exams/assignments/${lateAssignment.id}/answers`, "PUT",
      { answers: [{ examQuestionId: question.id, selectedIndex: displayedCorrectIndex }] }, lateCandidateCookie,
    );
    expect(expiredSave.status).toBe(403);
    const expiredHeartbeat = await request(
      `/exams/assignments/${lateAssignment.id}/session/heartbeat`, "POST",
      { event: "HEARTBEAT" }, lateCandidateCookie,
    );
    expect(expiredHeartbeat.status).toBe(403);

    const submitted = await request(
      `/exams/assignments/${lateAssignment.id}/submission`, "POST",
      {
        attemptUuid: "a8b5e7f0-4d22-4d71-92f0-9b6b5b8b1201",
        startedAt: session.startedAt,
        submittedAt: new Date().toISOString(),
        answers: [{ examQuestionId: question.id, selectedIndex: displayedCorrectIndex }],
      }, lateCandidateCookie,
    );
    expect(submitted.status).toBe(201);
    expect(submitted.json.submission).toMatchObject({ status: "REVIEW_REQUIRED" });
  });


  it("archives a published exam idempotently and blocks further publication and assignment", async () => {
    const studentArchive = await request(`/admin/exams/${examId}/archive`, "POST", {}, studentCookie);
    expect(studentArchive.status).toBe(403);

    const archived = await request(`/admin/exams/${examId}/archive`, "POST", {}, adminCookie);
    expect(archived.status).toBe(200);
    expect(archived.json).toMatchObject({ ok: true, examId, status: "ARCHIVED" });

    const repeated = await request(`/admin/exams/${examId}/archive`, "POST", {}, adminCookie);
    expect(repeated.status).toBe(200);
    expect(repeated.json).toMatchObject({ ok: true, examId, status: "ARCHIVED" });

    const publish = await request(`/admin/exams/${examId}/publish`, "POST", {}, adminCookie);
    expect(publish.status).toBe(409);
    expect(publish.json.error).toContain("Archived exams");

    const assign = await request(
      `/admin/exams/${examId}/assign`,
      "POST",
      { studentIds: [studentId] },
      adminCookie,
    );
    expect(assign.status).toBe(409);
    expect(assign.json.error).toContain("Archived exams");
    expect((await server.db.exam.findUniqueOrThrow({ where: { id: examId } })).status).toBe("ARCHIVED");
  });
});
