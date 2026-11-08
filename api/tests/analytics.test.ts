import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFromJson } from "../src/importService.js";
import { buildApp } from "../src/index.js";
import { bindSession, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let api: ReturnType<typeof bindSession>;
let studentId = 0;

const BANK: unknown[] = [
  ["Maths", "Maths Q1?", ["a1", "b1", "c1", "d1"], 0, "exp-m1"],
  ["Maths", "Maths Q2?", ["a2", "b2", "c2", "d2"], 1, "exp-m2"],
  ["Physics", "Physics Q1?", ["p1", "q1", "r1", "s1"], 3, "exp-p1"],
];

beforeAll(async () => {
  server = await startTestServer(buildApp);
  const report = await importFromJson(server.db, BANK);
  expect(report.added).toBe(3);
  const session = await signUp(server.baseUrl, "analyst@example.com");
  studentId = session.userId;
  api = bindSession(server.baseUrl, session.cookie);
});

afterAll(async () => {
  await server.close();
});

describe("analytics", () => {
  it("GET /analytics/weak-topics is empty with no stats", async () => {
    const { status, json } = await api.get(`/analytics/weak-topics`);
    expect(status).toBe(200);
    const body = json as { subjects: unknown[]; weakest: unknown };
    expect(body.subjects).toEqual([]);
    expect(body.weakest).toBeNull();
  });

  it("builds two attempts so stats exist", async () => {
    const c1 = (await api.post(`/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    })) as { status: number; json: { attemptId: number; questions: { id: number }[] } };
    expect(c1.status).toBe(201);
    await api.post(`/tests/${c1.json.attemptId}/submit`, {
      answers: [{ questionId: c1.json.questions[0].id, selectedIndex: 0 }],
    });

    const c2 = (await api.post(`/tests`, {
      mode: "practice",
      subject: "Physics",
      count: 1,
    })) as { status: number; json: { attemptId: number; questions: { id: number }[] } };
    expect(c2.status).toBe(201);
    await api.post(`/tests/${c2.json.attemptId}/submit`, {
      answers: [{ questionId: c2.json.questions[0].id, selectedIndex: 0 }],
    });
  });

  it("ranks weakest subject first", async () => {
    const { status, json } = await api.get(`/analytics/weak-topics`);
    expect(status).toBe(200);
    const body = json as {
      subjects: { subject: string; seen: number; wrong: number; accuracy: number }[];
      weakest: { subject: string; accuracy: number } | null;
    };
    expect(body.subjects.length).toBeGreaterThan(0);
    const sorted = [...body.subjects].sort((a, b) => a.accuracy - b.accuracy);
    expect(body.subjects).toEqual(sorted);
    expect(body.weakest?.subject).toBe(body.subjects[0].subject);
    const physics = body.subjects.find((s) => s.subject === "Physics");
    expect(physics?.accuracy).toBe(0);
    expect(physics?.wrong).toBe(1);
  });

  it("GET /analytics/overview reports accurate completed-practice metrics", async () => {
    const { status, json } = await api.get("/analytics/overview");
    expect(status).toBe(200);
    const body = json as {
      practice: {
        completedAttempts: number;
        correct: number;
        incorrect: number;
        unanswered: number;
        accuracy: number | null;
      };
      formalExams: { submissions: number; graded: number; reviewRequired: number };
    };
    expect(body.practice.completedAttempts).toBe(2);
    expect(body.practice.correct).toBe(1);
    expect(body.practice.incorrect).toBe(1);
    expect(body.practice.unanswered).toBe(0);
    expect(body.practice.accuracy).toBe(0.5);
    expect(body.formalExams).toMatchObject({ submissions: 0, graded: 0, reviewRequired: 0 });
  });

  it("counts unanswered practice questions separately from accuracy", async () => {
    const created = await api.post("/tests", {
      mode: "practice",
      subject: "Maths",
      count: 2,
    });
    expect(created.status).toBe(201);
    const body = created.json as { attemptId: number; questions: { id: number }[] };
    const question = await server.db.question.findUniqueOrThrow({
      where: { id: body.questions[0].id },
      select: { correctIndex: true },
    });
    const submitted = await api.post(`/tests/${body.attemptId}/submit`, {
      answers: [{ questionId: body.questions[0].id, selectedIndex: question.correctIndex }],
    });
    expect(submitted.status).toBe(200);

    const overview = await api.get("/analytics/overview");
    const report = overview.json as {
      practice: { correct: number; incorrect: number; unanswered: number; accuracy: number | null };
    };
    expect(report.practice.unanswered).toBe(1);
    expect(report.practice.accuracy).toBe(2 / 3);
  });

  it("aggregates formal exam results separately using immutable exam snapshots", async () => {
    const admin = await server.db.user.create({
      data: {
        email: "analytics-fixture-admin@example.com",
        passwordHash: "test-only",
        role: "ADMIN",
      },
    });
    const exam = await server.db.exam.create({
      data: { title: "Analytics fixture exam", createdById: admin.id },
    });
    const version = await server.db.examVersion.create({
      data: {
        examId: exam.id,
        version: 1,
        durationMinutes: 30,
        publishedAt: new Date(),
        questions: {
          create: [{
            position: 0,
            subject: "Physics",
            topic: "Mechanics",
            text: "Fixture question?",
            options: JSON.stringify(["A", "B", "C", "D"]),
            correctIndex: 0,
            explanation: "Fixture explanation",
            marks: 2,
            negativeMarks: 0.5,
          }],
        },
      },
      include: { questions: true },
    });
    const assignment = await server.db.examAssignment.create({
      data: {
        examVersionId: version.id,
        studentId,
        assignedById: admin.id,
      },
    });
    await server.db.examSubmission.create({
      data: {
        assignmentId: assignment.id,
        attemptUuid: "analytics-formal-fixture-uuid",
        startedAt: new Date(Date.now() - 60_000),
        submittedAt: new Date(),
        status: "GRADED",
        score: 2,
        maximumScore: 2,
        answers: {
          create: [{
            examQuestionId: version.questions[0].id,
            selectedIndex: 0,
            isCorrect: true,
            awardedMarks: 2,
          }],
        },
      },
    });

    const reviewVersion = await server.db.examVersion.create({
      data: {
        examId: exam.id,
        version: 2,
        durationMinutes: 30,
        publishedAt: new Date(),
        questions: {
          create: [{
            position: 0,
            subject: "Maths",
            topic: "Algebra",
            text: "Review fixture question?",
            options: JSON.stringify(["A", "B", "C", "D"]),
            correctIndex: 1,
            explanation: "Review fixture explanation",
            marks: 1,
            negativeMarks: 0.25,
          }],
        },
      },
      include: { questions: true },
    });
    const reviewAssignment = await server.db.examAssignment.create({
      data: {
        examVersionId: reviewVersion.id,
        studentId,
        assignedById: admin.id,
      },
    });
    await server.db.examSubmission.create({
      data: {
        assignmentId: reviewAssignment.id,
        attemptUuid: "analytics-review-fixture-uuid",
        startedAt: new Date(Date.now() - 60_000),
        submittedAt: new Date(),
        status: "REVIEW_REQUIRED",
        score: 1,
        maximumScore: 1,
        answers: {
          create: [{
            examQuestionId: reviewVersion.questions[0].id,
            selectedIndex: 1,
            isCorrect: true,
            awardedMarks: 1,
          }],
        },
      },
    });

    const response = await api.get("/analytics/overview");
    expect(response.status).toBe(200);
    const report = response.json as {
      practice: { completedAttempts: number };
      formalExams: {
        submissions: number;
        graded: number;
        reviewRequired: number;
        score: number;
        maximumScore: number;
        scorePercentage: number | null;
        subjects: { subject: string; topic?: string; correct: number; awardedMarks: number }[];
      };
    };
    expect(report.practice.completedAttempts).toBe(3);
    expect(report.formalExams).toMatchObject({
      submissions: 2,
      graded: 1,
      reviewRequired: 1,
      score: 2,
      maximumScore: 2,
      scorePercentage: 100,
    });
    expect(report.formalExams.subjects[0]).toMatchObject({
      subject: "Physics",
      correct: 1,
      awardedMarks: 2,
    });
  });

  it("keeps practice analytics classification stable after question-bank edits", async () => {
    const originalSubject = await server.db.subject.create({ data: { name: "Snapshot Subject" } });
    const originalTopic = await server.db.topic.create({
      data: { name: "Original Topic", subjectId: originalSubject.id },
    });
    const replacementSubject = await server.db.subject.create({ data: { name: "Renamed Subject" } });
    const replacementTopic = await server.db.topic.create({
      data: { name: "Replacement Topic", subjectId: replacementSubject.id },
    });
    const question = await server.db.question.create({
      data: {
        subjectId: originalSubject.id,
        topicId: originalTopic.id,
        text: "Snapshot classification fixture?",
        options: JSON.stringify(["A", "B", "C", "D"]),
        correctIndex: 0,
        questionHash: "snapshot-classification-fixture",
        difficulty: "easy",
      },
    });

    const created = await api.post("/tests", {
      mode: "practice",
      subject: originalSubject.name,
      count: 1,
    });
    expect(created.status).toBe(201);
    const attempt = created.json as { attemptId: number; questions: { id: number }[] };
    expect(attempt.questions[0].id).toBe(question.id);
    const submitted = await api.post(`/tests/${attempt.attemptId}/submit`, {
      answers: [{ questionId: question.id, selectedIndex: 0 }],
    });
    expect(submitted.status).toBe(200);

    const snapshot = await server.db.attemptAnswer.findFirstOrThrow({
      where: { attemptId: attempt.attemptId, questionId: question.id },
    });
    expect(snapshot).toMatchObject({
      subjectSnapshot: "Snapshot Subject",
      topicSnapshot: "Original Topic",
      difficultySnapshot: "easy",
    });

    await server.db.question.update({
      where: { id: question.id },
      data: {
        subjectId: replacementSubject.id,
        topicId: replacementTopic.id,
        difficulty: "hard",
      },
    });

    const report = await api.get("/analytics/weak-topics");
    expect(report.status).toBe(200);
    const subjects = (report.json as { subjects: { subject: string }[] }).subjects;
    expect(subjects.some((row) => row.subject === "Snapshot Subject")).toBe(true);
    expect(subjects.some((row) => row.subject === "Renamed Subject")).toBe(false);
  });

  it("does not include unfinished attempts in completed history or analytics", async () => {
    const created = await api.post("/tests", {
      mode: "practice",
      subject: "Maths",
      count: 1,
    });
    expect(created.status).toBe(201);
    const attemptId = (created.json as { attemptId: number }).attemptId;
    const history = await api.get("/analytics/history");
    expect((history.json as { attemptId: number }[]).some((item) => item.attemptId === attemptId)).toBe(false);
    const overview = await api.get("/analytics/overview");
    expect((overview.json as { practice: { completedAttempts: number } }).practice.completedAttempts).toBe(4);
  });

  it("keeps analytics isolated to the authenticated student", async () => {
    const other = await signUp(server.baseUrl, "analytics-isolation@example.com");
    const otherApi = bindSession(server.baseUrl, other.cookie);
    const response = await otherApi.get("/analytics/overview");
    expect(response.status).toBe(200);
    const report = response.json as {
      practice: { completedAttempts: number; questions: number; accuracy: number | null };
      formalExams: { submissions: number };
    };
    expect(report.practice).toMatchObject({ completedAttempts: 0, questions: 0, accuracy: null });
    expect(report.formalExams.submissions).toBe(0);
  });

  it("GET /analytics/recommendations returns actions based on the learner's results", async () => {
    const { status, json } = await api.get("/analytics/recommendations");
    expect(status).toBe(200);
    const body = json as {
      generatedAt: string;
      basedOnAttempts: number;
      recommendations: {
        id: string;
        priority: string;
        title: string;
        subject: string | null;
        mode: string;
        questionCount: number;
      }[];
    };
    expect(new Date(body.generatedAt).getTime()).toBeGreaterThan(0);
    expect(body.basedOnAttempts).toBeGreaterThanOrEqual(2);
    const weakReport = await api.get("/analytics/weak-topics");
    const weakSubjects = (weakReport.json as { subjects: { subject: string }[] }).subjects;
    expect(body.recommendations[0]).toMatchObject({
      id: "strengthen-weakest-subject",
      priority: "high",
      subject: weakSubjects[0].subject,
      mode: "practice",
      questionCount: 15,
    });
    expect(body.recommendations.some((item) => item.id === "review-mistakes")).toBe(true);
  });

  it("GET /analytics/history lists submitted attempts", async () => {
    const { status, json } = await api.get(`/analytics/history`);
    expect(status).toBe(200);
    const body = json as {
      attemptId: number;
      mode: string;
      score: number;
      total: number;
      expired: boolean;
      finishedAt: string | null;
    }[];
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body.every((h) => h.total > 0)).toBe(true);
    for (let i = 1; i < body.length; i++) {
      expect(new Date(body[i - 1].finishedAt ?? 0).getTime()).toBeGreaterThanOrEqual(
        new Date(body[i].finishedAt ?? 0).getTime()
      );
    }
  });

  it("GET /analytics/export returns stats + attempts + answers", async () => {
    const { status, json } = await api.get(`/analytics/export`);
    expect(status).toBe(200);
    const body = json as {
      exportedAt: string;
      stats: { questionId: number; seen: number; wrong: number }[];
      attempts: unknown[];
      answers: unknown[];
    };
    expect(new Date(body.exportedAt).getTime()).toBeGreaterThan(0);
    expect(body.stats.length).toBeGreaterThan(0);
    expect(body.attempts.length).toBeGreaterThan(0);
    expect(body.answers.length).toBeGreaterThan(0);
  });

  it("POST /analytics/import round-trips into a fresh DB", async () => {
    const exportRes = await api.get(`/analytics/export`);
    const payload = exportRes.json as {
      exportedAt: string;
      stats: unknown[];
      attempts: unknown[];
      answers: unknown[];
    };

    const fresh = await startTestServer(buildApp);
    const report = await importFromJson(fresh.db, BANK);
    expect(report.added).toBe(3);

    // A different account in the fresh DB — import must land under this user.
    const freshSession = await signUp(fresh.baseUrl, "restored@example.com");
    const freshApi = bindSession(fresh.baseUrl, freshSession.cookie);

    const importRes = await freshApi.post(`/analytics/import`, payload);
    expect(importRes.status).toBe(200);
    const importBody = importRes.json as {
      addedStats: number;
      updatedStats: number;
      addedAttempts: number;
      skippedDuplicates: number;
    };
    expect(importBody.addedStats).toBeGreaterThan(0);
    expect(importBody.addedAttempts).toBeGreaterThan(0);

    const weak = await freshApi.get(`/analytics/weak-topics`);
    const weakBody = weak.json as { subjects: { subject: string; accuracy: number }[] };
    expect(weakBody.subjects.length).toBeGreaterThan(0);

    await fresh.close();
  });

  it("POST /analytics/import rejects unknown question ids", async () => {
    const res = await api.post(`/analytics/import`, {
      stats: [{ questionId: 999999, seen: 1, wrong: 0 }],
    });
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toContain("unknown questions");
  });

  it("POST /analytics/import rejects malformed payload", async () => {
    const res = await api.post(`/analytics/import`, "not json");
    expect(res.status).toBe(400);
  });

  it("POST /analytics/import is idempotent on duplicate attempt ids", async () => {
    const exportRes = await api.get(`/analytics/export`);
    const payload = exportRes.json as {
      exportedAt: string;
      stats: unknown[];
      attempts: unknown[];
      answers: unknown[];
    };
    const first = await api.post(`/analytics/import`, payload);
    expect(first.status).toBe(200);
    const second = await api.post(`/analytics/import`, payload);
    expect(second.status).toBe(200);
    const body = second.json as { skippedDuplicates: number };
    expect(body.skippedDuplicates).toBeGreaterThan(0);
  });
});
