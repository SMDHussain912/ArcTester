import { createHash } from "node:crypto";
import { getLearningConceptsForTopic } from "./intelligence/conceptKnowledge.js";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { hashQuestion, QuestionInputSchema } from "./questions.js";
import { insertQuestion } from "./questionRepository.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { importFromCsv, importFromJson } from "./importService.js";
import {
  QUESTION_ANALYTICS_MINIMUM_ANSWERS,
  QUESTION_ANALYTICS_WEAK_ACCURACY,
} from "./analytics.js";

// A deadline-triggered client submit may arrive up to 10 seconds after the
// authoritative deadline because of request scheduling and network transit.
// Requests received later than this window are retained for invigilator review.
const AUTO_SUBMIT_GRACE_MS = 10_000;

const CreateExamSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  instructions: z.string().trim().max(5000).default(""),
  durationMinutes: z.number().int().min(1).max(600),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  subjectRules: z.record(z.string(), z.object({
    marks: z.number().finite().min(0).max(100),
    negativeMarks: z.number().finite().min(0).max(100),
  })).default({}),
  questions: z.array(
    z.object({
      questionId: z.number().int().positive(),
      marks: z.number().finite().min(0).max(100).default(1),
      negativeMarks: z.number().finite().min(0).max(100).default(0),
    })
  ).min(1).max(500),
}).refine((input) => input.questions.every((question) => question.negativeMarks <= question.marks), {
  message: "Negative marks cannot exceed the marks awarded for a correct answer.",
  path: ["questions"],
}).refine((input) => input.questions.some((question) => question.marks > 0), {
  message: "An exam must award more than zero total marks.",
  path: ["questions"],
});

const AssignExamSchema = z.object({
  studentIds: z.array(z.number().int().positive()).min(1).max(1000),
  availableFrom: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
}).refine((input) => new Set(input.studentIds).size === input.studentIds.length, {
  message: "Student IDs must be unique.",
  path: ["studentIds"],
}).refine((input) => {
  if (!input.availableFrom || !input.dueAt) return true;
  return new Date(input.dueAt) > new Date(input.availableFrom);
}, {
  message: "Due date must be after the availability date.",
  path: ["dueAt"],
});


const SaveExamAnswersSchema = z.object({
  revision: z.number().int().nonnegative().optional(),
  answers: z.array(z.object({
    examQuestionId: z.string().min(1).max(64),
    selectedIndex: z.number().int().min(0).max(3).nullable(),
  })).min(1).max(500),
}).refine((input) => new Set(input.answers.map((answer) => answer.examQuestionId)).size === input.answers.length, {
  message: "Each exam question may appear only once in an answer save.",
  path: ["answers"],
});

const SubmitExamSchema = z
  .object({
    attemptUuid: z.string().uuid(),
    startedAt: z.string().datetime(),
    submittedAt: z.string().datetime(),
    revision: z.number().int().nonnegative().optional(),
    answers: z
      .array(
        z.object({
          examQuestionId: z.string().min(1).max(64),
          selectedIndex: z.number().int().min(0).max(3).nullable(),
        })
      )
      .min(1)
      .max(500),
  })
  .refine((input) => new Set(input.answers.map((answer) => answer.examQuestionId)).size === input.answers.length, {
    message: "Each exam question may appear only once in a submission.",
    path: ["answers"],
  });

function stableOptionOrder(assignmentId: string, questionId: string, optionCount: number): number[] {
  const order = Array.from({ length: optionCount }, (_, index) => index);
  return order.sort((left, right) => {
    const leftKey = createHash("sha256").update(assignmentId + ":" + questionId + ":" + left).digest("hex");
    const rightKey = createHash("sha256").update(assignmentId + ":" + questionId + ":" + right).digest("hex");
    return leftKey.localeCompare(rightKey);
  });
}

function parseOptions(raw: string): string[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("A question in the bank has invalid options.");
  }
  return value;
}

export function examRouter(db: PrismaClient): Router {
  const router = Router();

  router.post("/admin/questions/import/preview", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const format = z.enum(["csv", "json"]).parse(req.body?.format);
      const content = z.string().min(1).max(8_000_000).parse(req.body?.content);
      let report;
      if (format === "csv") {
        report = await importFromCsv(db, content, { dryRun: true });
      } else {
        let payload: unknown;
        try {
          payload = JSON.parse(content);
        } catch {
          return next(badRequest("The JSON file is not valid JSON."));
        }
        report = await importFromJson(db, payload, { dryRun: true });
      }
      res.json({ ok: true, report });
    } catch (error) { next(error); }
  });

  router.post("/admin/questions/import/csv", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const content = z.string().min(1).max(8_000_000).parse(req.body?.content);
      const report = await importFromCsv(db, content);
      res.status(200).json({ ok: true, report });
    } catch (error) { next(error); }
  });

  router.post("/admin/questions/import/json", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const report = await importFromJson(db, req.body?.questions);
      res.status(200).json({ ok: true, report });
    } catch (error) { next(error); }
  });

  router.post("/admin/questions", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const input = QuestionInputSchema.parse(req.body);
      const outcome = await insertQuestion(db, input);
      if (outcome === "duplicate") return next(conflict("A question with the same text already exists."));
      const question = await db.question.findFirstOrThrow({
        where: { questionHash: hashQuestion(input.text) },
        include: { subject: { select: { name: true } }, topic: { select: { name: true } } },
      });
      res.status(201).json({
        ok: true,
        question: {
          id: question.id,
          subject: question.subject.name,
          topic: question.topic?.name ?? null,
          text: question.text,
          options: parseOptions(question.options),
          difficulty: question.difficulty,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/question-bank", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = z.object({
        page: z.coerce.number().int().min(1).max(1_000_000).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(200),
        search: z.string().trim().max(200).default(""),
        subject: z.string().trim().max(80).default(""),
        topic: z.string().trim().max(80).default(""),
        difficulty: z.enum(["", "easy", "medium", "hard"]).default(""),
      }).parse(req.query);
      const page = query.page;
      const pageSize = query.pageSize;
      const search = query.search;
      const subjectName = query.subject;
      const topicName = query.topic;
      const difficulty = query.difficulty;
      const where = {
        ...(subjectName ? { subject: { name: subjectName } } : {}),
        ...(topicName ? { topic: { name: topicName } } : {}),
        ...(difficulty ? { difficulty } : {}),
        ...(search ? { OR: [
          { text: { contains: search } },
          { subject: { name: { contains: search } } },
          { topic: { name: { contains: search } } },
        ] } : {}),
      };
      const [total, questions] = await Promise.all([
        db.question.count({ where }),
        db.question.findMany({
          where,
          orderBy: [{ subject: { name: "asc" } }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { subject: { select: { name: true } }, topic: { select: { name: true } } },
        }),
      ]);
      res.json({
        ok: true,
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
        questions: questions.map((question) => ({
          id: question.id,
          subject: question.subject.name,
          topic: question.topic?.name ?? null,
          text: question.text,
          options: parseOptions(question.options),
          correctIndex: question.correctIndex,
          explanation: question.explanation,
          source: question.source,
          difficulty: question.difficulty,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/subjects", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const subjects = await db.subject.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { questions: true, topics: true } }, topics: { orderBy: { name: "asc" } } },
      });
      res.json({ ok: true, subjects: subjects.map((subject) => ({
        id: subject.id, name: subject.name, questionCount: subject._count.questions,
        topics: subject.topics.map((topic) => ({ id: topic.id, name: topic.name })),
      })) });
    } catch (error) { next(error); }
  });

  router.post("/admin/subjects", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const input = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
      const subject = await db.subject.upsert({ where: { name: input.name }, update: {}, create: { name: input.name } });
      res.status(201).json({ ok: true, subject });
    } catch (error) { next(error); }
  });

  router.post("/admin/subjects/:id/topics", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const subjectId = Number(req.params.id);
      if (!Number.isInteger(subjectId) || subjectId < 1) return next(badRequest("Invalid subject ID."));
      const input = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
      const subject = await db.subject.findUnique({ where: { id: subjectId }, select: { id: true } });
      if (!subject) return next(notFound("Subject not found."));
      const topic = await db.topic.upsert({
        where: { subjectId_name: { subjectId, name: input.name } },
        update: {}, create: { subjectId, name: input.name },
      });
      res.status(201).json({ ok: true, topic });
    } catch (error) { next(error); }
  });

  router.delete("/admin/topics/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return next(badRequest("Invalid topic ID."));
      const topic = await db.topic.findUnique({ where: { id }, select: { id: true } });
      if (!topic) return next(notFound("Topic not found."));
      await db.topic.delete({ where: { id } });
      res.json({ ok: true, deleted: id });
    } catch (error) { next(error); }
  });

  router.patch("/admin/questions/bulk", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const input = z.object({
        ids: z.array(z.number().int().positive()).min(1).max(500),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      }).refine((value) => value.difficulty !== undefined, { message: "Choose at least one field to update." }).parse(req.body);
      if (new Set(input.ids).size !== input.ids.length) return next(badRequest("Question IDs must be unique."));
      const result = await db.question.updateMany({
        where: { id: { in: input.ids } },
        data: { difficulty: input.difficulty },
      });
      res.json({ ok: true, updated: result.count });
    } catch (error) { next(error); }
  });

  router.delete("/admin/questions/bulk", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const input = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }).parse(req.body);
      if (new Set(input.ids).size !== input.ids.length) return next(badRequest("Question IDs must be unique."));
      const result = await db.question.deleteMany({ where: { id: { in: input.ids } } });
      res.json({ ok: true, deleted: result.count });
    } catch (error) {
      const databaseError = error instanceof Error ? error.message : "";
      const errorCode = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      // Prisma reports P2003 on some providers; PostgreSQL may surface its
      // RESTRICT foreign-key violation as SQLSTATE 23001 inside the message.
      if (errorCode === "P2003" || /violates RESTRICT setting of foreign key constraint|SQLSTATE 23001|code: "23001"/i.test(databaseError)) {
        return next(conflict("Some selected questions are already used by attempts or reports and cannot be deleted. Archive or keep those questions instead."));
      }
      next(error);
    }
  });

  router.patch("/admin/questions/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return next(badRequest("Invalid question ID."));
      const input = QuestionInputSchema.parse(req.body);
      const existing = await db.question.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return next(notFound("Question not found."));
      const subject = await db.subject.upsert({ where: { name: input.subject }, update: {}, create: { name: input.subject } });
      const topicName = input.topic?.trim() || "General";
      const topic = await db.topic.upsert({
        where: { subjectId_name: { subjectId: subject.id, name: topicName } },
        update: {}, create: { subjectId: subject.id, name: topicName },
      });
      const question = await db.question.update({
        where: { id },
        data: {
          subjectId: subject.id, topicId: topic.id, text: input.text,
          options: JSON.stringify(input.options), correctIndex: input.correctIndex,
          explanation: input.explanation, source: input.source,
          difficulty: input.difficulty, questionHash: hashQuestion(input.text),
        },
        include: { subject: { select: { name: true } }, topic: { select: { name: true } } },
      });
      res.json({ ok: true, question: {
        id: question.id, subject: question.subject.name, topic: question.topic?.name ?? null,
        text: question.text, options: parseOptions(question.options), correctIndex: question.correctIndex,
        explanation: question.explanation, source: question.source, difficulty: question.difficulty,
      } });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as {code?: string}).code === "P2002") {
        return next(conflict("Another question already uses this question text."));
      }
      next(error);
    }
  });

  router.delete("/admin/questions/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 1) return next(badRequest("Invalid question ID."));
      const question = await db.question.findUnique({ where: { id }, select: { id: true } });
      if (!question) return next(notFound("Question not found."));
      await db.question.delete({ where: { id } });
      res.json({ ok: true, deleted: id });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2003") {
        return next(conflict("This question is already used in practice history or student progress and cannot be deleted."));
      }
      next(error);
    }
  });

  router.get("/admin/students", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        search: z.string().trim().max(120).optional(),
      }).parse(req.query);
      const where = { role: "STUDENT", ...(query.search ? { email: { contains: query.search } } : {}) };
      const [students, total] = await Promise.all([
        db.user.findMany({
          where, orderBy: { email: "asc" },
          skip: (query.page - 1) * query.limit, take: query.limit,
          select: { id: true, email: true },
        }),
        db.user.count({ where }),
      ]);
      res.json({ ok: true, students, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) });
    } catch (error) { next(error); }
  });

  router.get("/admin/analytics/overview", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const [
        studentCount, examCount, assignmentCount, submissionCount, reviewRequiredCount,
        practiceAttemptCount, practiceRows, formalRows, examRows, recentSubmissions, averageRows,
      ] = await Promise.all([
        db.user.count({ where: { role: "STUDENT" } }),
        db.exam.count(),
        db.examAssignment.count(),
        db.examSubmission.count({ where: { assignment: { student: { role: "STUDENT" } } } }),
        db.examSubmission.count({ where: { status: "REVIEW_REQUIRED", assignment: { student: { role: "STUDENT" } } } }),
        db.attempt.count({ where: { finishedAt: { not: null }, user: { role: "STUDENT" } } }),
        db.$queryRaw<Array<{
          questionId: number; subject: string; topic: string | null; difficulty: string;
          correct: number; incorrect: number; unanswered: number; uniqueStudents: number;
        }>>`
          SELECT aa."questionId" AS "questionId",
            MAX(CASE WHEN aa."subjectSnapshot" <> '' THEN aa."subjectSnapshot" ELSE s.name END) AS subject,
            MAX(CASE WHEN aa."subjectSnapshot" <> '' THEN aa."topicSnapshot" ELSE t.name END) AS topic,
            MAX(CASE WHEN aa."difficultySnapshot" <> '' THEN aa."difficultySnapshot" ELSE q.difficulty END) AS difficulty,
            SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = TRUE THEN 1 ELSE 0 END) AS correct,
            SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = FALSE THEN 1 ELSE 0 END) AS incorrect,
            SUM(CASE WHEN aa.chosen IS NULL THEN 1 ELSE 0 END) AS unanswered,
            COUNT(DISTINCT CASE WHEN aa.chosen IS NOT NULL THEN a."userId" END) AS "uniqueStudents"
          FROM "AttemptAnswer" aa
          INNER JOIN "Attempt" a ON a.id = aa."attemptId"
          INNER JOIN "User" u ON u.id = a."userId"
          INNER JOIN "Question" q ON q.id = aa."questionId"
          INNER JOIN "Subject" s ON s.id = q."subjectId"
          LEFT JOIN "Topic" t ON t.id = q."topicId"
          WHERE a."finishedAt" IS NOT NULL AND u.role = 'STUDENT'
          GROUP BY aa."questionId"
        `,
        db.$queryRaw<Array<{
          subject: string; topic: string | null; correct: number; incorrect: number;
          unanswered: number; awardedMarks: number; maximumMarks: number;
        }>>`
          SELECT eq.subject AS subject, eq.topic AS topic,
            SUM(CASE WHEN ea."selectedIndex" IS NOT NULL AND ea."isCorrect" = TRUE THEN 1 ELSE 0 END) AS correct,
            SUM(CASE WHEN ea."selectedIndex" IS NOT NULL AND ea."isCorrect" = FALSE THEN 1 ELSE 0 END) AS incorrect,
            SUM(CASE WHEN ea."selectedIndex" IS NULL THEN 1 ELSE 0 END) AS unanswered,
            SUM(ea."awardedMarks") AS "awardedMarks", SUM(eq.marks) AS "maximumMarks"
          FROM "ExamSubmissionAnswer" ea
          INNER JOIN "ExamSubmission" es ON es.id = ea."submissionId"
          INNER JOIN "ExamAssignment" ass ON ass.id = es."assignmentId"
          INNER JOIN "User" u ON u.id = ass."studentId"
          INNER JOIN "ExamVersionQuestion" eq ON eq.id = ea."examQuestionId"
          WHERE es.status = 'GRADED' AND u.role = 'STUDENT'
          GROUP BY eq.subject, eq.topic
        `,
        db.$queryRaw<Array<{
          examId: string; title: string; assigned: number; submitted: number; averagePercentage: number | null;
        }>>`
          SELECT ev."examId" AS "examId", e.title AS title,
            COUNT(ass.id) AS assigned,
            SUM(CASE WHEN sub.id IS NOT NULL THEN 1 ELSE 0 END) AS submitted,
            AVG(CASE WHEN sub.status = 'GRADED' AND sub.score IS NOT NULL AND sub."maximumScore" > 0
              THEN (sub.score * 100.0) / sub."maximumScore" ELSE NULL END) AS "averagePercentage"
          FROM "ExamAssignment" ass
          INNER JOIN "ExamVersion" ev ON ev.id = ass."examVersionId"
          INNER JOIN "Exam" e ON e.id = ev."examId"
          LEFT JOIN "ExamSubmission" sub ON sub."assignmentId" = ass.id
          GROUP BY ev."examId", e.title
          ORDER BY assigned DESC
        `,
        db.examSubmission.findMany({
          where: { assignment: { student: { role: "STUDENT" } } },
          orderBy: { submittedAt: "desc" }, take: 10,
          select: {
            id: true, submittedAt: true, score: true, maximumScore: true, status: true,
            assignment: {
              select: {
                studentId: true, student: { select: { email: true } },
                examVersion: { select: { exam: { select: { title: true } } } },
              },
            },
          },
        }),
        db.$queryRaw<Array<{ averagePercentage: number | null }>>`
          SELECT AVG((sub.score * 100.0) / sub."maximumScore") AS "averagePercentage"
          FROM "ExamSubmission" sub
          INNER JOIN "ExamAssignment" ass ON ass.id = sub."assignmentId"
          INNER JOIN "User" u ON u.id = ass."studentId"
          WHERE u.role = 'STUDENT' AND sub.status = 'GRADED'
            AND sub.score IS NOT NULL AND sub."maximumScore" > 0
        `,
      ]);

      const practiceBySubject = new Map<string, { correct: number; incorrect: number; unanswered: number }>();
      const practiceByTopic = new Map<string, { subject: string; topic: string | null; correct: number; incorrect: number; unanswered: number }>();
      const questionPerformance = practiceRows.map((row) => {
        const correct = Number(row.correct ?? 0), incorrect = Number(row.incorrect ?? 0), unanswered = Number(row.unanswered ?? 0);
        const subject = row.subject, topic = row.topic;
        const subjectRow = practiceBySubject.get(subject) ?? { correct: 0, incorrect: 0, unanswered: 0 };
        subjectRow.correct += correct; subjectRow.incorrect += incorrect; subjectRow.unanswered += unanswered;
        practiceBySubject.set(subject, subjectRow);
        const key = JSON.stringify([subject, topic]);
        const topicRow = practiceByTopic.get(key) ?? { subject, topic, correct: 0, incorrect: 0, unanswered: 0 };
        topicRow.correct += correct; topicRow.incorrect += incorrect; topicRow.unanswered += unanswered;
        practiceByTopic.set(key, topicRow);
        const sampleSize = correct + incorrect;
        const uniqueStudents = Number(row.uniqueStudents ?? 0);
        const accuracy = sampleSize > 0 ? correct / sampleSize : null;
        const sufficientData = sampleSize >= QUESTION_ANALYTICS_MINIMUM_ANSWERS && uniqueStudents >= 3;
        return {
          questionId: row.questionId, subject, topic, difficulty: row.difficulty,
          correct, incorrect, unanswered, sampleSize, uniqueStudents, accuracy,
          sufficientData, weak: sufficientData && accuracy !== null && accuracy < QUESTION_ANALYTICS_WEAK_ACCURACY,
        };
      }).sort((a, b) => Number(b.weak) - Number(a.weak) || (a.accuracy ?? 1) - (b.accuracy ?? 1) || b.sampleSize - a.sampleSize);
      const practiceCorrect = questionPerformance.reduce((sum, row) => sum + row.correct, 0);
      const practiceIncorrect = questionPerformance.reduce((sum, row) => sum + row.incorrect, 0);
      const practiceUnanswered = questionPerformance.reduce((sum, row) => sum + row.unanswered, 0);
      const practiceAnswered = practiceCorrect + practiceIncorrect;

      const formalBySubject = new Map<string, { correct: number; incorrect: number; unanswered: number; awardedMarks: number; maximumMarks: number }>();
      const formalByTopic = new Map<string, { subject: string; topic: string | null; correct: number; incorrect: number; unanswered: number; awardedMarks: number; maximumMarks: number }>();
      let formalCorrect = 0, formalIncorrect = 0, formalUnanswered = 0;
      for (const row of formalRows) {
        const correct = Number(row.correct ?? 0), incorrect = Number(row.incorrect ?? 0), unanswered = Number(row.unanswered ?? 0);
        const awardedMarks = Number(row.awardedMarks ?? 0), maximumMarks = Number(row.maximumMarks ?? 0);
        formalCorrect += correct; formalIncorrect += incorrect; formalUnanswered += unanswered;
        const subjectRow = formalBySubject.get(row.subject) ?? { correct: 0, incorrect: 0, unanswered: 0, awardedMarks: 0, maximumMarks: 0 };
        subjectRow.correct += correct; subjectRow.incorrect += incorrect; subjectRow.unanswered += unanswered;
        subjectRow.awardedMarks += awardedMarks; subjectRow.maximumMarks += maximumMarks;
        formalBySubject.set(row.subject, subjectRow);
        const key = JSON.stringify([row.subject, row.topic]);
        const topicRow = formalByTopic.get(key) ?? { subject: row.subject, topic: row.topic, correct: 0, incorrect: 0, unanswered: 0, awardedMarks: 0, maximumMarks: 0 };
        topicRow.correct += correct; topicRow.incorrect += incorrect; topicRow.unanswered += unanswered;
        topicRow.awardedMarks += awardedMarks; topicRow.maximumMarks += maximumMarks;
        formalByTopic.set(key, topicRow);
      }
      const exams = examRows.map((row) => {
        const assigned = Number(row.assigned ?? 0), submitted = Number(row.submitted ?? 0);
        return {
          examId: row.examId, title: row.title, assigned, submitted,
          submissionRate: assigned ? submitted / assigned : 0,
          averagePercentage: row.averagePercentage === null ? null : Number(row.averagePercentage),
        };
      });
      const averagePercentage = averageRows[0]?.averagePercentage == null ? null : Number(averageRows[0].averagePercentage);
      const recent = recentSubmissions.map((item) => ({
        submissionId: item.id, studentId: item.assignment.studentId,
        studentEmail: item.assignment.student.email,
        examTitle: item.assignment.examVersion.exam.title,
        submittedAt: item.submittedAt, score: item.score,
        maximumScore: item.maximumScore, status: item.status,
      }));
      const gradedCount = await db.examSubmission.count({ where: { status: "GRADED", assignment: { student: { role: "STUDENT" } } } });
      res.json({
        ok: true,
        totals: {
          students: studentCount, exams: examCount, assignments: assignmentCount,
          submissions: submissionCount, reviewRequired: reviewRequiredCount,
          submissionRate: assignmentCount ? submissionCount / assignmentCount : 0,
          averagePercentage,
        },
        practice: {
          completedAttempts: practiceAttemptCount,
          questions: practiceCorrect + practiceIncorrect + practiceUnanswered,
          correct: practiceCorrect, incorrect: practiceIncorrect, unanswered: practiceUnanswered,
          accuracy: practiceAnswered > 0 ? practiceCorrect / practiceAnswered : null,
          subjects: [...practiceBySubject.entries()].map(([subject, row]) => ({
            subject, ...row, accuracy: row.correct + row.incorrect > 0 ? row.correct / (row.correct + row.incorrect) : null,
          })),
          topics: [...practiceByTopic.values()].map((row) => ({
            ...row, accuracy: row.correct + row.incorrect > 0 ? row.correct / (row.correct + row.incorrect) : null,
          })),
          questionPerformance: {
            minimumAnswers: QUESTION_ANALYTICS_MINIMUM_ANSWERS, minimumStudents: 3,
            weakAccuracyThreshold: QUESTION_ANALYTICS_WEAK_ACCURACY,
            insufficientSampleCount: questionPerformance.filter((row) => !row.sufficientData).length,
            questions: questionPerformance,
          },
        },
        formalExams: {
          graded: gradedCount, reviewRequired: reviewRequiredCount,
          correct: formalCorrect, incorrect: formalIncorrect, unanswered: formalUnanswered,
          subjects: [...formalBySubject.entries()].map(([subject, row]) => ({
            subject, ...row, accuracy: row.correct + row.incorrect > 0 ? row.correct / (row.correct + row.incorrect) : null,
          })),
          topics: [...formalByTopic.values()].map((row) => ({
            ...row, accuracy: row.correct + row.incorrect > 0 ? row.correct / (row.correct + row.incorrect) : null,
          })),
        },
        exams, recentSubmissions: recent,
      });
    } catch (error) { next(error); }
  });
  router.get("/admin/submissions/review-required", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      }).parse(req.query);
      const where = { status: "REVIEW_REQUIRED", assignment: { student: { role: "STUDENT" } } };
      const [items, total] = await Promise.all([
        db.examSubmission.findMany({
          where, orderBy: { receivedAt: "desc" },
          skip: (query.page - 1) * query.limit, take: query.limit,
          select: {
            id: true, submittedAt: true, receivedAt: true, score: true, maximumScore: true,
            assignment: {
              select: {
                id: true, studentId: true, student: { select: { email: true } },
                examVersion: { select: { exam: { select: { title: true } } } },
              },
            },
          },
        }),
        db.examSubmission.count({ where }),
      ]);
      res.json({
        ok: true,
        submissions: items.map((item) => ({
          submissionId: item.id, assignmentId: item.assignment.id, studentId: item.assignment.studentId,
          studentEmail: item.assignment.student.email, examTitle: item.assignment.examVersion.exam.title,
          submittedAt: item.submittedAt, receivedAt: item.receivedAt,
          score: item.score, maximumScore: item.maximumScore,
        })),
        page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit),
      });
    } catch (error) { next(error); }
  });

  router.get("/admin/submissions/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const submission = await db.examSubmission.findUnique({
        where: { id: req.params.id },
        include: {
          assignment: {
            include: {
              student: { select: { id: true, email: true } },
              examVersion: {
                include: {
                  exam: { select: { id: true, title: true } },
                  questions: { orderBy: { position: "asc" } },
                },
              },
            },
          },
          answers: true,
        },
      });
      if (!submission) return next(notFound("Submission not found."));
      const answers = new Map(submission.answers.map((answer) => [answer.examQuestionId, answer]));
      res.json({
        ok: true,
        submission: {
          id: submission.id, status: submission.status, score: submission.score,
          maximumScore: submission.maximumScore, startedAt: submission.startedAt,
          submittedAt: submission.submittedAt, receivedAt: submission.receivedAt,
          student: submission.assignment.student,
          exam: {
            ...submission.assignment.examVersion.exam,
            version: submission.assignment.examVersion.version,
            durationMinutes: submission.assignment.examVersion.durationMinutes,
          },
          availableFrom: submission.assignment.availableFrom, dueAt: submission.assignment.dueAt,
          questions: submission.assignment.examVersion.questions.map((question) => {
            const answer = answers.get(question.id);
            return {
              id: question.id, position: question.position, subject: question.subject,
              topic: question.topic, text: question.text, options: parseOptions(question.options),
              correctIndex: question.correctIndex, explanation: question.explanation,
              marks: question.marks, negativeMarks: question.negativeMarks,
              selectedIndex: answer?.selectedIndex ?? null, isCorrect: answer?.isCorrect ?? false,
              awardedMarks: answer?.awardedMarks ?? 0,
            };
          }),
        },
      });
    } catch (error) { next(error); }
  });

  router.post("/admin/submissions/:id/release", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const submission = await db.examSubmission.findUnique({
        where: { id: req.params.id }, select: { id: true, status: true },
      });
      if (!submission) return next(notFound("Submission not found."));
      if (submission.status === "GRADED") {
        return res.json({ ok: true, submissionId: submission.id, status: "GRADED", alreadyReleased: true });
      }
      const released = await db.examSubmission.updateMany({
        where: { id: submission.id, status: "REVIEW_REQUIRED" }, data: { status: "GRADED" },
      });
      if (released.count !== 1) return next(conflict("This submission is no longer awaiting review."));
      res.json({ ok: true, submissionId: submission.id, status: "GRADED" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/exams/live-sessions", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), eventLimit: z.coerce.number().int().min(1).max(100).default(12) }).parse(req.query);
      const where = { status: { in: ["ACTIVE", "PAUSED", "INTERRUPTED"] } };
      const [sessions, total] = await Promise.all([
        db.examSession.findMany({
          where, orderBy: { lastHeartbeatAt: "desc" },
          skip: (query.page - 1) * query.limit, take: query.limit,
          include: {
            student: { select: { id: true, email: true } },
            assignment: { include: { examVersion: { include: { exam: { select: { id: true, title: true } } } }, submission: { select: { id: true, status: true } } } },
            events: { orderBy: { createdAt: "desc" }, take: query.eventLimit, include: { actor: { select: { email: true, role: true } } } },
          },
        }),
        db.examSession.count({ where }),
      ]);
      const now = Date.now();
      res.json({
        ok: true, serverTime: new Date(now),
        sessions: sessions.map((session) => ({
          id: session.id, status: session.status, student: session.student,
          exam: session.assignment.examVersion.exam, assignmentId: session.assignmentId,
          startedAt: session.startedAt, lastHeartbeatAt: session.lastHeartbeatAt,
          connectivity: session.status === "ACTIVE" && session.lastHeartbeatAt && now - session.lastHeartbeatAt.getTime() <= 90000 ? "CONNECTED" : "STALE",
          heartbeatCount: session.heartbeatCount, focusLossCount: session.focusLossCount,
          disconnectCount: session.disconnectCount, submission: session.assignment.submission, events: session.events,
        })),
        page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit),
      });
    } catch (error) { next(error); }
  });

  router.get("/admin/exams/attendance", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(req.query);
      const [assignments, total] = await Promise.all([
        db.examAssignment.findMany({
          orderBy: { assignedAt: "desc" },
          skip: (query.page - 1) * query.limit, take: query.limit,
          include: {
            student: { select: { id: true, email: true } },
            examVersion: { include: { exam: { select: { id: true, title: true } }, _count: { select: { questions: true } } } },
            session: { select: { id: true, status: true, startedAt: true, lastHeartbeatAt: true, endedAt: true, heartbeatCount: true, focusLossCount: true, disconnectCount: true } },
            submission: { select: { id: true, status: true, submittedAt: true, score: true, maximumScore: true } },
          },
        }),
        db.examAssignment.count(),
      ]);
      const now = Date.now();
      res.json({
        ok: true, serverTime: new Date(now),
        attendance: assignments.map((item) => ({
          assignmentId: item.id, candidate: item.student, exam: item.examVersion.exam,
          version: item.examVersion.version, questionCount: item.examVersion._count.questions,
          assignedAt: item.assignedAt, availableFrom: item.availableFrom, dueAt: item.dueAt,
          attendanceStatus: item.submission ? "SUBMITTED" : item.session?.startedAt ? item.session.status : "NOT_STARTED",
          connectivity: item.session?.status === "ACTIVE" && item.session.lastHeartbeatAt && now - item.session.lastHeartbeatAt.getTime() <= 90000 ? "CONNECTED" : item.session?.startedAt ? "STALE_OR_INACTIVE" : "NOT_STARTED",
          session: item.session, submission: item.submission,
        })),
        page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit),
      });
    } catch (error) { next(error); }
  });

  router.get("/admin/exams/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const exam = await db.exam.findUnique({
        where: { id: req.params.id },
        include: { versions: { orderBy: { version: "desc" }, take: 1, include: { questions: { orderBy: { position: "asc" } } } } },
      });
      if (!exam) return next(notFound("Exam not found."));
      const version = exam.versions[0];
      res.json({ ok: true, exam: {
        id: exam.id, title: exam.title, description: exam.description, status: exam.status,
        version: version ? {
          id: version.id, version: version.version, instructions: version.instructions,
          durationMinutes: version.durationMinutes, shuffleQuestions: version.shuffleQuestions,
          shuffleOptions: version.shuffleOptions,
          questions: version.questions.map((question) => ({
            questionId: question.sourceQuestionId, marks: question.marks, negativeMarks: question.negativeMarks,
          })),
        } : null,
      } });
    } catch (error) { next(error); }
  });

  router.get("/admin/exams", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const exams = await db.exam.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            include: {
              _count: { select: { questions: true, assignments: true } },
            },
          },
        },
      });
      res.json({ ok: true, exams });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/exams/validate-paper", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const input = z.object({
        durationMinutes: z.number().int().min(1).max(600),
        questions: z.array(z.object({
          questionId: z.number().int().positive(),
          marks: z.number().finite().min(0).max(100),
          negativeMarks: z.number().finite().min(0).max(100),
        })).min(1).max(500),
      }).parse(req.body);
      const ids = input.questions.map((question) => question.questionId);
      const errors: string[] = [];
      const warnings: string[] = [];
      if (new Set(ids).size !== ids.length) errors.push("Duplicate questions are not allowed in one paper.");
      if (input.questions.some((question) => question.negativeMarks > question.marks)) errors.push("Negative marks cannot exceed the marks for a correct answer.");
      const source = await db.question.findMany({
        where: { id: { in: [...new Set(ids)] } },
        include: { subject: true },
      });
      if (source.length !== new Set(ids).size) errors.push("One or more selected questions no longer exist in the question bank.");
      const byId = new Map(source.map((question) => [question.id, question]));
      const subjects = new Map<string, number>();
      const difficulties = new Map<string, number>();
      let totalMarks = 0;
      for (const selected of input.questions) {
        totalMarks += selected.marks;
        const question = byId.get(selected.questionId);
        if (!question) continue;
        subjects.set(question.subject.name, (subjects.get(question.subject.name) ?? 0) + 1);
        const difficulty = question.difficulty || "unspecified";
        difficulties.set(difficulty, (difficulties.get(difficulty) ?? 0) + 1);
      }
      if (totalMarks <= 0) errors.push("The paper must award more than zero total marks.");
      const subjectRows = [...subjects.entries()].map(([subject, count]) => ({ subject, count, percentage: Math.round(count / input.questions.length * 100) }));
      const difficultyRows = [...difficulties.entries()].map(([difficulty, count]) => ({ difficulty, count, percentage: Math.round(count / input.questions.length * 100) }));
      if (subjectRows.length > 1 && subjectRows.some((row) => row.percentage > 70)) warnings.push("One subject contributes more than 70% of the paper. Verify this against the approved examination blueprint.");
      if (subjectRows.length > 1 && subjectRows.some((row) => row.percentage < 5)) warnings.push("A selected subject contributes less than 5% of the paper. Check whether its allocation is intentional.");
      if ((difficulties.get("easy") ?? 0) === 0 || (difficulties.get("medium") ?? 0) === 0 || (difficulties.get("hard") ?? 0) === 0) warnings.push("The paper does not contain all three difficulty levels. Confirm the intended difficulty blueprint.");
      const averageSeconds = input.questions.length ? input.durationMinutes * 60 / input.questions.length : 0;
      if (averageSeconds < 30) warnings.push("Average time is below 30 seconds per question. Check whether the duration is sufficient.");
      if (averageSeconds > 300) warnings.push("Average time exceeds 5 minutes per question. Confirm the duration and question complexity.");
      res.json({ ok: true, valid: errors.length === 0, errors, warnings, totalQuestions: input.questions.length, totalMarks, averageSecondsPerQuestion: Math.round(averageSeconds), subjects: subjectRows, difficulties: difficultyRows });
    } catch (error) { next(error); }
  });

  router.post("/admin/exams", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = CreateExamSchema.parse(req.body);
      const questionIds = input.questions.map((question) => question.questionId);
      if (new Set(questionIds).size !== questionIds.length) {
        return next(badRequest("An exam cannot contain the same question more than once."));
      }

      const sourceQuestions = await db.question.findMany({
        where: { id: { in: questionIds } },
        include: { subject: true, topic: true },
      });
      if (sourceQuestions.length !== questionIds.length) {
        return next(badRequest("One or more selected question IDs do not exist."));
      }
      const questionById = new Map(sourceQuestions.map((question) => [question.id, question]));
      const snapshots = input.questions.map((selection, position) => {
        const question = questionById.get(selection.questionId)!;
        return {
          sourceQuestionId: question.id,
          position,
          subject: question.subject.name,
          topic: question.topic?.name ?? null,
          text: question.text,
          options: JSON.stringify(parseOptions(question.options)),
          correctIndex: question.correctIndex,
          explanation: question.explanation,
          marks: input.subjectRules[question.subject.name]?.marks ?? selection.marks,
          negativeMarks: input.subjectRules[question.subject.name]?.negativeMarks ?? selection.negativeMarks,
        };
      });

      const exam = await db.$transaction(async (tx) => {
        const created = await tx.exam.create({
          data: {
            title: input.title,
            description: input.description,
            createdById: req.user!.id,
          },
        });
        const version = await tx.examVersion.create({
          data: {
            examId: created.id,
            version: 1,
            instructions: input.instructions,
            durationMinutes: input.durationMinutes,
            shuffleQuestions: input.shuffleQuestions,
            shuffleOptions: input.shuffleOptions,
          },
        });
        await tx.examVersionQuestion.createMany({
          data: snapshots.map((snapshot) => ({ ...snapshot, examVersionId: version.id })),
        });
        return tx.exam.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            versions: {
              include: { _count: { select: { questions: true, assignments: true } } },
            },
          },
        });
      });
      res.status(201).json({ ok: true, exam });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/exams/:id/report", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const exam = await db.exam.findUnique({
        where: { id: req.params.id },
        include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1, include: {
          questions: { orderBy: { position: "asc" }, include: { submissionAnswers: { include: { submission: { select: { status: true } } } } } },
          assignments: { include: { submission: true, session: { select: { status: true, startedAt: true, lastHeartbeatAt: true, focusLossCount: true, disconnectCount: true } } } },
        } } },
      });
      if (!exam) return next(notFound("Exam not found."));
      const version = exam.versions[0];
      if (!version) return res.json({ ok: true, report: { title: exam.title, version: null, assigned: 0, started: 0, active: 0, submitted: 0, reviewRequired: 0, averagePercentage: null, subjects: [], questions: [] } });
      const submitted = version.assignments.filter((assignment) => assignment.submission !== null);
      const graded = submitted.filter((assignment) => assignment.submission?.status === "GRADED" && assignment.submission.maximumScore && assignment.submission.score !== null);
      const averagePercentage = graded.length ? graded.reduce((sum, assignment) => sum + (assignment.submission!.score! / assignment.submission!.maximumScore!) * 100, 0) / graded.length : null;
      const subjects = new Map<string, { subject: string; questions: number; correct: number; incorrect: number; unanswered: number; marks: number }>();
      const questionReport = version.questions.map((question) => {
        // Official question statistics include only graded submissions; flagged attempts remain separate for review.
        const responses = question.submissionAnswers.filter((answer) => answer.submission.status === "GRADED");
        const correct = responses.filter((answer) => answer.isCorrect).length;
        const unanswered = responses.filter((answer) => answer.selectedIndex === null).length;
        const incorrect = responses.length - correct - unanswered;
        const subject = subjects.get(question.subject) ?? { subject: question.subject, questions: 0, correct: 0, incorrect: 0, unanswered: 0, marks: 0 };
        subject.questions += 1; subject.correct += correct; subject.incorrect += incorrect; subject.unanswered += unanswered; subject.marks += question.marks;
        subjects.set(question.subject, subject);
        return { questionId: question.id, position: question.position + 1, subject: question.subject, topic: question.topic, responses: responses.length, correct, incorrect, unanswered, accuracy: responses.length - unanswered > 0 ? correct / (responses.length - unanswered) : null };
      });
      const now = Date.now();
      const active = version.assignments.filter((assignment) => assignment.session?.status === "ACTIVE" && assignment.session.lastHeartbeatAt && now - assignment.session.lastHeartbeatAt.getTime() <= 90000).length;
      res.json({ ok: true, report: {
        title: exam.title, version: version.version, assigned: version.assignments.length,
        started: version.assignments.filter((assignment) => assignment.session?.startedAt).length,
        active, submitted: submitted.length, reviewRequired: submitted.filter((assignment) => assignment.submission?.status === "REVIEW_REQUIRED").length,
        averagePercentage, subjects: [...subjects.values()], questions: questionReport,
      } });
    } catch (error) { next(error); }
  });

  router.get("/admin/exams/:id/latest-version", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const exam = await db.exam.findUnique({
        where: { id: req.params.id },
        include: { versions: { orderBy: { version: "desc" }, take: 1, include: { questions: { orderBy: { position: "asc" } } } } },
      });
      if (!exam) return next(notFound("Exam not found."));
      res.json({ ok: true, exam: {
        id: exam.id, title: exam.title, description: exam.description, status: exam.status,
        version: exam.versions[0] ? {
          id: exam.versions[0].id, version: exam.versions[0].version,
          instructions: exam.versions[0].instructions, durationMinutes: exam.versions[0].durationMinutes,
          shuffleQuestions: exam.versions[0].shuffleQuestions, shuffleOptions: exam.versions[0].shuffleOptions,
          publishedAt: exam.versions[0].publishedAt,
          questions: exam.versions[0].questions.map((question) => ({
            sourceQuestionId: question.sourceQuestionId, position: question.position,
            subject: question.subject, topic: question.topic, text: question.text,
            marks: question.marks, negativeMarks: question.negativeMarks,
          })),
        } : null,
      } });
    } catch (error) { next(error); }
  });

  router.patch("/admin/exams/:id", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = CreateExamSchema.parse(req.body);
      const existing = await db.exam.findUnique({
        where: { id: req.params.id },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      if (!existing) return next(notFound("Exam not found."));
      if (existing.status === "ARCHIVED") return next(conflict("Archived exams cannot be edited. Duplicate the exam to create an active copy."));
      const questionIds = input.questions.map((question) => question.questionId);
      if (new Set(questionIds).size !== questionIds.length) return next(badRequest("An exam cannot contain the same question more than once."));
      const sourceQuestions = await db.question.findMany({
        where: { id: { in: questionIds } }, include: { subject: true, topic: true },
      });
      if (sourceQuestions.length !== questionIds.length) return next(badRequest("One or more selected question IDs do not exist."));
      const questionById = new Map(sourceQuestions.map((question) => [question.id, question]));
      const snapshots = input.questions.map((selection, position) => {
        const question = questionById.get(selection.questionId)!;
        return {
          position, sourceQuestionId: question.id, subject: question.subject.name,
          topic: question.topic?.name ?? null, text: question.text,
          options: JSON.stringify(parseOptions(question.options)), correctIndex: question.correctIndex,
          explanation: question.explanation, marks: selection.marks, negativeMarks: selection.negativeMarks,
        };
      });
      const nextVersion = (existing.versions[0]?.version ?? 0) + 1;
      const exam = await db.$transaction(async (tx) => {
        await tx.exam.update({
          where: { id: existing.id },
          data: { title: input.title, description: input.description, status: "DRAFT" },
        });
        const version = await tx.examVersion.create({
          data: {
            examId: existing.id, version: nextVersion, instructions: input.instructions,
            durationMinutes: input.durationMinutes, shuffleQuestions: input.shuffleQuestions,
            shuffleOptions: input.shuffleOptions,
          },
        });
        await tx.examVersionQuestion.createMany({
          data: snapshots.map((snapshot) => ({ ...snapshot, examVersionId: version.id })),
        });
        return tx.exam.findUniqueOrThrow({
          where: { id: existing.id },
          include: { versions: { orderBy: { version: "desc" }, take: 1, include: { _count: { select: { questions: true, assignments: true } } } } },
        });
      });
      res.json({ ok: true, exam });
    } catch (error) { next(error); }
  });

  router.post("/admin/exams/:id/clone", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const source = await db.exam.findUnique({
        where: { id: req.params.id },
        include: { versions: { orderBy: { version: "desc" }, take: 1, include: { questions: { orderBy: { position: "asc" } } } } },
      });
      const version = source?.versions[0];
      if (!source || !version) return next(notFound("Exam or exam version not found."));
      const copy = await db.$transaction(async (tx) => {
        const exam = await tx.exam.create({
          data: { title: `Copy of ${source.title}`.slice(0, 120), description: source.description, createdById: req.user!.id },
        });
        const nextVersion = await tx.examVersion.create({
          data: {
            examId: exam.id, version: 1, instructions: version.instructions,
            durationMinutes: version.durationMinutes, shuffleQuestions: version.shuffleQuestions,
            shuffleOptions: version.shuffleOptions,
          },
        });
        if (version.questions.length) {
          await tx.examVersionQuestion.createMany({
            data: version.questions.map((question) => ({
              examVersionId: nextVersion.id, sourceQuestionId: question.sourceQuestionId,
              position: question.position, subject: question.subject, topic: question.topic,
              text: question.text, options: question.options, correctIndex: question.correctIndex,
              explanation: question.explanation, marks: question.marks, negativeMarks: question.negativeMarks,
            })),
          });
        }
        return tx.exam.findUniqueOrThrow({
          where: { id: exam.id },
          include: { versions: { include: { _count: { select: { questions: true, assignments: true } } } } },
        });
      });
      res.status(201).json({ ok: true, exam: copy });
    } catch (error) { next(error); }
  });

  router.post("/admin/exams/:id/archive", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const exam = await db.exam.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
      if (!exam) return next(notFound("Exam not found."));
      if (exam.status === "ARCHIVED") return res.json({ ok: true, examId: exam.id, status: exam.status });
      await db.exam.update({ where: { id: exam.id }, data: { status: "ARCHIVED" } });
      res.json({ ok: true, examId: exam.id, status: "ARCHIVED" });
    } catch (error) { next(error); }
  });

  router.post("/admin/exams/:id/publish", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const exam = await db.exam.findUnique({
        where: { id: req.params.id },
        include: { versions: { orderBy: { version: "desc" }, take: 1, include: { _count: { select: { questions: true } } } } },
      });
      const version = exam?.versions[0];
      if (!exam || !version) return next(notFound("Exam not found."));
      if (exam.status === "ARCHIVED") return next(conflict("Archived exams cannot be published."));
      if (version._count.questions === 0) return next(badRequest("Add at least one question before publishing."));
      if (version.publishedAt) return res.json({ ok: true, examId: exam.id, versionId: version.id, publishedAt: version.publishedAt });
      const publishedAt = new Date();
      await db.$transaction([
        db.examVersion.update({ where: { id: version.id }, data: { publishedAt } }),
        db.exam.update({ where: { id: exam.id }, data: { status: "PUBLISHED" } }),
      ]);
      res.json({ ok: true, examId: exam.id, versionId: version.id, publishedAt });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/exams/:id/assign", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = AssignExamSchema.parse(req.body);
      const exam = await db.exam.findUnique({
        where: { id: req.params.id },
        include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1 } },
      });
      const version = exam?.versions[0];
      if (!exam || !version) return next(notFound("No published exam version is available to assign."));
      if (exam.status === "ARCHIVED") return next(conflict("Archived exams cannot receive new assignments."));

      const students = await db.user.findMany({
        where: { id: { in: input.studentIds }, role: "STUDENT" },
        select: { id: true },
      });
      if (students.length !== input.studentIds.length) {
        return next(badRequest("One or more selected accounts are not students."));
      }

      const assignments = await db.$transaction(async (tx) => {
        const results = [];
        for (const studentId of input.studentIds) {
          const existing = await tx.examAssignment.findUnique({
            where: { examVersionId_studentId: { examVersionId: version.id, studentId } },
            select: { id: true },
          });
          if (existing) continue;
          results.push(await tx.examAssignment.create({
            data: {
              examVersionId: version.id,
              studentId,
              assignedById: req.user!.id,
              availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
              dueAt: input.dueAt ? new Date(input.dueAt) : null,
            },
            select: { id: true, studentId: true, assignedAt: true, dueAt: true },
          }));
        }
        return results;
      });
      res.status(201).json({ ok: true, created: assignments.length, assignments });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        return next(conflict("One or more students already have an assignment for this exam version. Refresh the assignment list before retrying."));
      }
      next(error);
    }
  });

  router.get("/exams/catalog", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const exams = await db.exam.findMany({
        where: { versions: { some: { publishedAt: { not: null } } } },
        orderBy: { updatedAt: "desc" },
        include: { versions: {
          where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1,
          include: {
            _count: { select: { questions: true } },
            assignments: { where: { studentId: req.user!.id }, select: { id: true, availableFrom: true, dueAt: true, submission: { select: { id: true, status: true } } } },
          },
        } },
      });
      res.json({ ok: true, catalog: exams.flatMap((exam) => exam.versions.map((version) => ({
        examId: exam.id, title: exam.title, description: exam.description,
        version: version.version, durationMinutes: version.durationMinutes,
        questionCount: version._count.questions, publishedAt: version.publishedAt,
        assignment: version.assignments[0] ?? null,
      }))) });
    } catch (error) { next(error); }
  });

  router.get("/exams/assigned", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const assignments = await db.examAssignment.findMany({
        where: { studentId: req.user!.id },
        orderBy: { assignedAt: "desc" },
        include: {
          examVersion: {
            include: {
              exam: { select: { id: true, title: true, description: true } },
              _count: { select: { questions: true } },
            },
          },
          submission: { select: { id: true, status: true, score: true, maximumScore: true, submittedAt: true } },
        },
      });
      res.json({
        ok: true,
        assignments: assignments.map((assignment) => ({
          id: assignment.id,
          status: assignment.status,
          assignedAt: assignment.assignedAt,
          availableFrom: assignment.availableFrom,
          dueAt: assignment.dueAt,
          exam: assignment.examVersion.exam,
          version: assignment.examVersion.version,
          durationMinutes: assignment.examVersion.durationMinutes,
          questionCount: assignment.examVersion._count.questions,
          submission: assignment.submission,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  // Server-owned exam session: browser timestamps are never the source of truth.
  router.post("/exams/assignments/:id/session/start", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const assignment = await db.examAssignment.findFirst({
        where: { id: req.params.id, studentId: req.user!.id },
        include: { examVersion: { select: { durationMinutes: true, publishedAt: true } }, submission: true, session: true },
      });
      if (!assignment) return next(notFound("Exam assignment not found."));
      if (!assignment.examVersion.publishedAt) return next(forbidden("This exam is not published."));
      if (assignment.submission) return next(conflict("This exam has already been submitted."));
      const now = new Date();
      if (assignment.availableFrom && assignment.availableFrom > now) return next(forbidden("This exam is not available yet."));
      if (assignment.dueAt && assignment.dueAt <= now) return next(forbidden("The exam deadline has passed."));
      if (assignment.session?.status === "TERMINATED" || assignment.session?.status === "COMPLETED" || assignment.session?.status === "EXPIRED") {
        return next(conflict("This exam session has been closed by the invigilator."));
      }
      if (assignment.session?.status === "PAUSED") {
        return next(conflict("This exam session is paused by the invigilator. Wait for the invigilator to resume it."));
      }
      if (assignment.session?.startedAt && now.getTime() >= assignment.session.startedAt.getTime() + assignment.examVersion.durationMinutes * 60000 + assignment.session.pausedDurationMs + 60000) {
        await db.$transaction(async (tx) => {
          const changed = await tx.examSession.updateMany({
            where: { id: assignment.session!.id, status: assignment.session!.status },
            data: { status: "EXPIRED", endedAt: now },
          });
          if (changed.count === 1) {
            await tx.examSessionEvent.create({
              data: { sessionId: assignment.session!.id, actorId: req.user!.id, type: "SESSION_EXPIRED", detail: "Server-side examination duration elapsed before the candidate reconnected." },
            });
          }
        });
        return next(conflict("The exam duration has expired. Contact the invigilator."));
      }
      const session = assignment.session
        ? await db.$transaction(async (tx) => {
            const changed = await tx.examSession.updateMany({
              where: {
                id: assignment.session!.id,
                status: assignment.session!.status,
                startedAt: { not: null },
              },
              data: { status: "ACTIVE", lastHeartbeatAt: now, lastActivityAt: now },
            });
            if (changed.count !== 1) {
              throw conflict("The exam session changed while reconnecting. Refresh and try again.");
            }
            const updated = await tx.examSession.findUniqueOrThrow({
              where: { id: assignment.session!.id },
            });
            await tx.examSessionEvent.create({
              data: { sessionId: updated.id, actorId: req.user!.id, type: "SESSION_RESUMED", detail: "Candidate restored an existing active session." },
            });
            return updated;
          })
        : await db.examSession.create({
            data: {
              assignmentId: assignment.id, studentId: req.user!.id, status: "ACTIVE",
              startedAt: now, lastHeartbeatAt: now, lastActivityAt: now,
              events: { create: { actorId: req.user!.id, type: "SESSION_STARTED", detail: "Candidate started the assigned examination." } },
            },
          });
      const deadline = session.startedAt ? new Date(session.startedAt.getTime() + assignment.examVersion.durationMinutes * 60000 + session.pausedDurationMs) : null;
      res.json({ ok: true, session: { id: session.id, status: session.status, startedAt: session.startedAt, lastHeartbeatAt: session.lastHeartbeatAt, serverTime: now, deadline } });
    } catch (error) { next(error); }
  });

  router.get("/exams/assignments/:id/answers", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const assignment = await db.examAssignment.findFirst({
        where: { id: req.params.id, studentId: req.user!.id },
        include: { session: { include: { answers: { orderBy: { updatedAt: "asc" } } } } },
      });
      if (!assignment) return next(notFound("Exam assignment not found."));
      res.json({
        ok: true,
        revision: assignment.session?.answersRevision ?? 0,
        answers: assignment.session?.answers.map((answer) => ({
          examQuestionId: answer.examQuestionId,
          selectedIndex: answer.selectedIndex,
          updatedAt: answer.updatedAt,
        })) ?? [],
      });
    } catch (error) { next(error); }
  });

  router.put("/exams/assignments/:id/answers", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = SaveExamAnswersSchema.parse(req.body);
      const assignment = await db.examAssignment.findFirst({
        where: { id: req.params.id, studentId: req.user!.id },
        include: {
          session: true,
          submission: { select: { id: true } },
          examVersion: { include: { questions: { select: { id: true, options: true } } } },
        },
      });
      if (!assignment) return next(notFound("Exam assignment not found."));
      if (assignment.submission) return next(conflict("This exam has already been submitted."));
      if (!assignment.session || assignment.session.status !== "ACTIVE" || !assignment.session.startedAt) {
        return next(conflict("There is no active exam session to save answers."));
      }
      const now = new Date();
      const deadline = new Date(
        assignment.session.startedAt.getTime() +
        assignment.examVersion.durationMinutes * 60_000 +
        assignment.session.pausedDurationMs
      );
      if (now >= deadline || (assignment.dueAt && now >= assignment.dueAt)) {
        return next(forbidden("The examination time has expired."));
      }
      const questionById = new Map(assignment.examVersion.questions.map((question) => [question.id, question]));
      for (const answer of input.answers) {
        const question = questionById.get(answer.examQuestionId);
        if (!question) return next(badRequest("An answer is for a question not in this exam."));
        const optionCount = parseOptions(question.options).length;
        if (answer.selectedIndex !== null && answer.selectedIndex >= optionCount) {
          return next(badRequest("The selected option does not exist for this question."));
        }
      }
      const revision = await db.$transaction(async (tx) => {
        const bumped = await tx.examSession.updateMany({
          where: {
            id: assignment.session!.id,
            status: "ACTIVE",
            startedAt: { not: null },
            ...(input.revision === undefined ? {} : { answersRevision: input.revision }),
          },
          data: { answersRevision: { increment: 1 }, lastActivityAt: now },
        });
        if (bumped.count !== 1) {
          throw conflict("These answers were changed in another session. Reload the exam before continuing.");
        }
        for (const answer of input.answers) {
          await tx.examSessionAnswer.upsert({
            where: {
              sessionId_examQuestionId: {
                sessionId: assignment.session!.id,
                examQuestionId: answer.examQuestionId,
              },
            },
            create: {
              sessionId: assignment.session!.id,
              examQuestionId: answer.examQuestionId,
              selectedIndex: answer.selectedIndex,
            },
            update: { selectedIndex: answer.selectedIndex },
          });
        }
        const updated = await tx.examSession.findUniqueOrThrow({
          where: { id: assignment.session!.id },
          select: { answersRevision: true },
        });
        return updated.answersRevision;
      });
      res.json({ ok: true, savedAt: now, savedCount: input.answers.length, revision });
    } catch (error) { next(error); }
  });

  router.post("/exams/assignments/:id/session/heartbeat", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ event: z.enum(["HEARTBEAT", "FOCUS_LOST", "FOCUS_RESTORED", "CONNECTION_RESTORED"]).default("HEARTBEAT") }).parse(req.body ?? {});
      const assignment = await db.examAssignment.findFirst({
        where: { id: req.params.id, studentId: req.user!.id },
        include: { session: true, examVersion: { select: { durationMinutes: true } }, submission: { select: { id: true } } },
      });
      if (!assignment) return next(notFound("Exam assignment not found."));
      if (!assignment.session || assignment.session.status !== "ACTIVE") return next(conflict("There is no active exam session."));
      if (assignment.submission) return next(conflict("This exam has already been submitted."));
      const now = new Date();
      const deadline = assignment.session.startedAt
        ? new Date(assignment.session.startedAt.getTime() + assignment.examVersion.durationMinutes * 60000 + assignment.session.pausedDurationMs)
        : null;
      if (deadline && now.getTime() >= deadline.getTime() + 60000) {
        await db.$transaction(async (tx) => {
          const changed = await tx.examSession.updateMany({
            where: { id: assignment.session!.id, status: "ACTIVE" },
            data: { status: "EXPIRED", endedAt: now },
          });
          if (changed.count === 1) {
            await tx.examSessionEvent.create({
              data: { sessionId: assignment.session!.id, actorId: req.user!.id, type: "SESSION_EXPIRED", detail: "Server-side examination deadline elapsed." },
            });
          }
        });
        return next(conflict("The examination time has expired."));
      }
      if (assignment.dueAt && assignment.dueAt <= now) return next(forbidden("The examination submission deadline has passed."));
      const stale = assignment.session.lastHeartbeatAt && now.getTime() - assignment.session.lastHeartbeatAt.getTime() > 90000;
      const session = await db.$transaction(async (tx) => {
        const changed = await tx.examSession.updateMany({
          where: {
            id: assignment.session!.id,
            status: "ACTIVE",
            startedAt: assignment.session!.startedAt,
          },
          data: {
            lastHeartbeatAt: now, lastActivityAt: now, heartbeatCount: { increment: 1 },
            ...(input.event === "FOCUS_LOST" ? { focusLossCount: { increment: 1 } } : {}),
            ...(stale ? { disconnectCount: { increment: 1 } } : {}),
          },
        });
        if (changed.count !== 1) throw conflict("The exam session is no longer active.");
        const updated = await tx.examSession.findUniqueOrThrow({ where: { id: assignment.session!.id } });
        if (input.event !== "HEARTBEAT" || stale) {
          await tx.examSessionEvent.create({
            data: { sessionId: updated.id, actorId: req.user!.id, type: stale ? "CONNECTION_RESTORED" : input.event, detail: stale ? "Heartbeat resumed after a connection gap." : "Candidate browser activity signal." },
          });
        }
        return updated;
      });
      const effectiveDeadline = session.startedAt ? new Date(session.startedAt.getTime() + assignment.examVersion.durationMinutes * 60000 + session.pausedDurationMs) : null;
      res.json({ ok: true, serverTime: now, deadline: effectiveDeadline, sessionStatus: session.status });
    } catch (error) { next(error); }
  });

  router.get("/admin/exams/assignments/:id/audit", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const assignment = await db.examAssignment.findUnique({
        where: { id: req.params.id },
        include: {
          student: { select: { id: true, email: true } },
          examVersion: { include: { exam: { select: { title: true } } } },
          session: {
            include: {
              events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { id: true, email: true, role: true } } } },
            },
          },
          submission: { select: { id: true, status: true, submittedAt: true, receivedAt: true, score: true, maximumScore: true } },
        },
      });
      if (!assignment) return next(notFound("Exam assignment not found."));
      res.json({ ok: true, audit: {
        assignmentId: assignment.id, candidate: assignment.student,
        exam: assignment.examVersion.exam, version: assignment.examVersion.version,
        session: assignment.session ? {
          id: assignment.session.id, status: assignment.session.status,
          startedAt: assignment.session.startedAt, lastHeartbeatAt: assignment.session.lastHeartbeatAt,
          endedAt: assignment.session.endedAt, heartbeatCount: assignment.session.heartbeatCount,
          focusLossCount: assignment.session.focusLossCount, disconnectCount: assignment.session.disconnectCount,
        } : null,
        submission: assignment.submission,
        events: assignment.session?.events ?? [],
      } });
    } catch (error) { next(error); }
  });

  router.post("/admin/exams/sessions/:id/action", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ action: z.enum(["PAUSE", "RESUME", "TERMINATE"]), reason: z.string().trim().max(300).default("") }).parse(req.body);
      const session = await db.examSession.findUnique({ where: { id: req.params.id } });
      if (!session) return next(notFound("Exam session not found."));
      if (["COMPLETED", "TERMINATED", "EXPIRED"].includes(session.status)) return next(conflict("This exam session is already closed."));
      const now = new Date();
      const status = input.action === "PAUSE" ? "PAUSED" : input.action === "RESUME" ? "ACTIVE" : "TERMINATED";
      const updated = await db.$transaction(async (tx) => {
        const current = await tx.examSession.findUnique({ where: { id: session.id } });
        if (!current) throw notFound("Exam session not found.");
        if (["COMPLETED", "TERMINATED", "EXPIRED"].includes(current.status)) {
          throw conflict("This exam session is already closed.");
        }
        if (input.action === "PAUSE" && current.status === "PAUSED") {
          // Repeated pause is idempotent and must not reset pausedAt or add
          // duplicate audit events.
          return { id: current.id, status: current.status, endedAt: current.endedAt };
        }
        if (input.action === "PAUSE" && current.status !== "ACTIVE") {
          throw conflict("Only an active exam session can be paused.");
        }
        if (input.action === "RESUME" && current.status !== "PAUSED") {
          throw conflict("This exam session is not paused.");
        }
        const changed = await tx.examSession.updateMany({
          where: { id: current.id, status: current.status },
          data: {
            status, lastActivityAt: now,
            ...(input.action === "PAUSE" ? { pausedAt: now } : {}),
            ...(input.action === "RESUME" && current.pausedAt ? { pausedDurationMs: { increment: now.getTime() - current.pausedAt.getTime() }, pausedAt: null } : {}),
            ...(input.action === "TERMINATE" ? {
              endedAt: now,
              pausedAt: null,
              ...(current.pausedAt ? { pausedDurationMs: { increment: Math.max(0, now.getTime() - current.pausedAt.getTime()) } } : {}),
            } : {}),
          },
        });
        if (changed.count !== 1) throw conflict("The exam session changed concurrently. Refresh and try again.");
        await tx.examSessionEvent.create({
          data: { sessionId: current.id, actorId: req.user!.id, type: "INVIGILATOR_" + input.action, detail: input.reason || "Action taken by invigilator." },
        });
        return tx.examSession.findUniqueOrThrow({
          where: { id: current.id },
          select: { id: true, status: true, endedAt: true },
        });
      });
      res.json({ ok: true, session: { id: updated.id, status: updated.status, endedAt: updated.endedAt } });
    } catch (error) { next(error); }
  });

  router.get("/exams/assignments/:id/package", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const assignment = await db.examAssignment.findFirst({
        where: { id: req.params.id, studentId: req.user!.id },
        include: {
          examVersion: {
            include: {
              exam: { select: { id: true, title: true, description: true } },
              questions: { orderBy: { position: "asc" } },
            },
          },
        },
      });
      if (!assignment) return next(notFound("Exam assignment not found."));
      const now = Date.now();
      if (!assignment.examVersion.publishedAt) return next(forbidden("This exam is not published."));
      if (assignment.availableFrom && assignment.availableFrom.getTime() > now) {
        return next(forbidden("This exam is not available yet."));
      }
      if (assignment.dueAt && assignment.dueAt.getTime() < now) {
        return next(forbidden("The exam deadline has passed."));
      }
      const orderedQuestions = [...assignment.examVersion.questions];
      if (assignment.examVersion.shuffleQuestions) orderedQuestions.sort(() => Math.random() - 0.5);
      const packageBody = {
        assignmentId: assignment.id,
        examId: assignment.examVersion.exam.id,
        title: assignment.examVersion.exam.title,
        description: assignment.examVersion.exam.description,
        version: assignment.examVersion.version,
        instructions: assignment.examVersion.instructions,
        durationMinutes: assignment.examVersion.durationMinutes,
        availableFrom: assignment.availableFrom,
        dueAt: assignment.dueAt,
        serverTime: new Date(now).toISOString(),
        questions: orderedQuestions.map((question) => {
          const originalOptions = parseOptions(question.options);
          const optionOrder = assignment.examVersion.shuffleOptions
            ? stableOptionOrder(assignment.id, question.id, originalOptions.length)
            : originalOptions.map((_, index) => index);
          return {
            id: question.id,
            position: question.position,
            subject: question.subject,
            topic: question.topic,
            text: question.text,
            options: optionOrder.map((index) => originalOptions[index]),
            optionOrder,
            marks: question.marks,
            negativeMarks: question.negativeMarks,
          };
        }),
      };
      const digest = createHash("sha256").update(JSON.stringify(packageBody)).digest("hex");
      res.json({ ok: true, package: packageBody, sha256: digest });
    } catch (error) {
      next(error);
    }
  });


  router.post("/exams/assignments/:id/submission", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = SubmitExamSchema.parse(req.body);
      const assignment = await db.examAssignment.findFirst({
        where: { id: req.params.id, studentId: req.user!.id },
        include: {
          examVersion: { include: { questions: { orderBy: { position: "asc" } } } },
          submission: true,
          session: true,
        },
      });
      if (!assignment) return next(notFound("Exam assignment not found."));
      if (!assignment.examVersion.publishedAt) {
        return next(forbidden("This exam is not published."));
      }

      if (assignment.submission) {
        if (assignment.submission.attemptUuid === input.attemptUuid) {
          return res.json({
            ok: true,
            duplicate: true,
            submission: {
              id: assignment.submission.id,
              attemptUuid: assignment.submission.attemptUuid,
              status: assignment.submission.status,
              score: assignment.submission.score,
              maximumScore: assignment.submission.maximumScore,
              submittedAt: assignment.submission.submittedAt,
              receivedAt: assignment.submission.receivedAt,
            },
          });
        }
        return next(conflict("An attempt has already been submitted for this assignment."));
      }

      // Validate the complete answer set before creating or changing any session state.
      // Invalid offline submissions must not leave behind a reconciled session.
      const questions = assignment.examVersion.questions;
      const questionById = new Map(questions.map((question) => [question.id, question]));
      if (
        input.answers.length !== questions.length ||
        input.answers.some((answer) => !questionById.has(answer.examQuestionId))
      ) {
        return next(badRequest("Submit one answer entry for every question in this exam."));
      }
      for (const answer of input.answers) {
        const question = questionById.get(answer.examQuestionId)!;
        const optionCount = parseOptions(question.options).length;
        if (answer.selectedIndex !== null && answer.selectedIndex >= optionCount) {
          return next(badRequest("The selected option does not exist for this question."));
        }
      }

      const serverSubmittedAt = new Date();
      const examSession = assignment.session;
      const offlineSessionReconciled = !examSession;
      // Validate offline client time now, but defer all reconciliation writes to
      // the submission transaction so a rejected attempt cannot leave an ACTIVE session.
      const claimedStartedAt = offlineSessionReconciled ? new Date(input.startedAt) : null;
      if (claimedStartedAt) {
        if (!Number.isFinite(claimedStartedAt.getTime()) || claimedStartedAt.getTime() > serverSubmittedAt.getTime() + 60_000) {
          return next(badRequest("The offline exam start time is invalid."));
        }
        if (assignment.availableFrom && claimedStartedAt < assignment.availableFrom) {
          return next(forbidden("The exam was started before its availability window."));
        }
      }
      if (examSession && (examSession.status !== "ACTIVE" || !examSession.startedAt)) {
        return next(conflict("The exam session is not active. Resume it before submitting."));
      }
      const serverStartedAt = examSession?.startedAt ?? claimedStartedAt;
      if (!serverStartedAt) return next(conflict("The exam session has no valid start time."));
      const sessionPausedDurationMs = examSession?.pausedDurationMs ?? 0;
      const sessionLastHeartbeatAt = examSession?.lastHeartbeatAt ?? serverSubmittedAt;
      // A request may arrive just after the due time even when the candidate
      // autosaved answers before the deadline. Keep the submission for review
      // instead of discarding those answers; late timing is marked REVIEW_REQUIRED.
      const answersByQuestion = new Map(
        input.answers.map((answer) => [answer.examQuestionId, answer.selectedIndex])
      );
      const answerRows = questions.map((question) => {
        const displayedIndex = answersByQuestion.get(question.id) ?? null;
        const optionOrder = assignment.examVersion.shuffleOptions
          ? stableOptionOrder(assignment.id, question.id, parseOptions(question.options).length)
          : parseOptions(question.options).map((_, index) => index);
        const selectedIndex = displayedIndex === null ? null : optionOrder[displayedIndex];
        const isCorrect = selectedIndex !== null && selectedIndex === question.correctIndex;
        const awardedMarks = isCorrect
          ? question.marks
          : selectedIndex === null
            ? 0
            : -question.negativeMarks;
        return {
          examQuestionId: question.id,
          selectedIndex,
          isCorrect,
          awardedMarks,
        };
      });
      const score = answerRows.reduce((total, answer) => total + answer.awardedMarks, 0);
      const maximumScore = questions.reduce((total, question) => total + question.marks, 0);

      // Offline timestamps are client claims. Suspicious values are retained for review,
      // not silently trusted as proof of when the exam was conducted.
      // Server-owned session timestamps prevent candidates from extending time by editing browser clocks.
      const startedAt = serverStartedAt;
      const submittedAt = serverSubmittedAt;
      const durationMs = assignment.examVersion.durationMinutes * 60 * 1000 + sessionPausedDurationMs;
      const staleHeartbeat = !sessionLastHeartbeatAt ||
        serverSubmittedAt.getTime() - sessionLastHeartbeatAt.getTime() > 90000;
      const durationDeadlineMs = startedAt.getTime() + durationMs;
      const assignmentDueAtMs = assignment.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const authoritativeDeadlineMs = Math.min(durationDeadlineMs, assignmentDueAtMs);
      const pastAutoSubmitGraceWindow =
        serverSubmittedAt.getTime() > authoritativeDeadlineMs + AUTO_SUBMIT_GRACE_MS;
      const suspiciousTiming =
        offlineSessionReconciled ||
        pastAutoSubmitGraceWindow ||
        staleHeartbeat ||
        (assignment.availableFrom !== null && startedAt < assignment.availableFrom) ||
        new Date(input.startedAt).getTime() < startedAt.getTime() - 60000 ||
        new Date(input.startedAt).getTime() > startedAt.getTime() + 60000;

      let submission: {
        id: string;
        attemptUuid: string;
        status: string;
        score: number | null;
        maximumScore: number | null;
        submittedAt: Date;
        receivedAt: Date;
      };
      let duplicateSubmission = false;
      try {
        submission = await db.$transaction(async (tx) => {
          const existing = await tx.examSubmission.findUnique({
            where: { assignmentId: assignment.id },
          });
          if (existing) {
            if (existing.attemptUuid === input.attemptUuid) {
              duplicateSubmission = true;
              return existing;
            }
            throw conflict("An attempt has already been submitted for this assignment.");
          }

          const duplicateAttempt = await tx.examSubmission.findUnique({
            where: { attemptUuid: input.attemptUuid },
          });
          if (duplicateAttempt) {
            throw conflict("This attempt identifier has already been used.");
          }

          // Check idempotency before reconciling an offline session. The session
          // and its audit event are created inside this transaction so any later
          // failure (including a reused attempt UUID) rolls them back together.
          const submissionSession = examSession ?? await tx.examSession.create({
            data: {
              assignmentId: assignment.id,
              studentId: req.user!.id,
              status: "ACTIVE",
              startedAt: serverStartedAt,
              lastHeartbeatAt: serverSubmittedAt,
              lastActivityAt: serverSubmittedAt,
              events: {
                create: {
                  actorId: req.user!.id,
                  type: "OFFLINE_SESSION_RECONCILED",
                  detail: "An offline exam attempt was reconciled when the device reconnected.",
                },
              },
            },
          });

          if (!offlineSessionReconciled && input.revision !== undefined) {
            const currentRevision = await tx.examSession.updateMany({
              where: {
                id: submissionSession.id,
                status: "ACTIVE",
                startedAt: serverStartedAt,
                answersRevision: input.revision,
              },
              data: { answersRevision: { increment: 1 } },
            });
            if (currentRevision.count !== 1) {
              throw conflict("These answers were changed in another session. Reload the exam before submitting.");
            }
          }

          // Finalize only if the session is still active with the same start time
          // observed before the transaction. This prevents a concurrent invigilator
          // pause or termination from being overwritten by a late submission.
          const completedSession = await tx.examSession.updateMany({
            where: {
              id: submissionSession.id,
              status: "ACTIVE",
              startedAt: serverStartedAt,
            },
            data: { status: "COMPLETED", endedAt: serverSubmittedAt, lastActivityAt: serverSubmittedAt },
          });
          if (completedSession.count !== 1) {
            const concurrentSubmission = await tx.examSubmission.findUnique({
              where: { assignmentId: assignment.id },
            });
            if (concurrentSubmission?.attemptUuid === input.attemptUuid) {
              duplicateSubmission = true;
              return concurrentSubmission;
            }
            throw conflict("The exam session changed before submission was finalized. Refresh and contact the invigilator.");
          }

          const created = await tx.examSubmission.create({
            data: {
              assignmentId: assignment.id,
              attemptUuid: input.attemptUuid,
              startedAt,
              submittedAt,
              status: suspiciousTiming ? "REVIEW_REQUIRED" : "GRADED",
              score,
              maximumScore,
              answers: { create: answerRows },
            },
            select: {
              id: true,
              attemptUuid: true,
              status: true,
              score: true,
              maximumScore: true,
              submittedAt: true,
              receivedAt: true,
            },
          });
          await tx.examAssignment.update({
            where: { id: assignment.id },
            data: { status: "SUBMITTED" },
          });
          await tx.examSessionEvent.create({
            data: { sessionId: submissionSession.id, actorId: req.user!.id, type: "SUBMITTED", detail: suspiciousTiming ? "Submission retained for invigilator review due to timing or connectivity signals." : "Candidate submitted the examination." },
          });
          return created;
      });

      } catch (error) {
        const errorCode = typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: string }).code
          : undefined;
        if (errorCode === "P2002") {
          // Two identical submit requests can both pass the initial read.
          // The unique assignment constraint elects one winner; the loser
          // returns that committed result instead of surfacing a 500.
          const duplicate = await db.examSubmission.findUnique({
            where: { assignmentId: assignment.id },
            select: {
              id: true, attemptUuid: true, status: true, score: true,
              maximumScore: true, submittedAt: true, receivedAt: true,
            },
          });
          if (duplicate?.attemptUuid === input.attemptUuid) {
            return res.json({ ok: true, duplicate: true, submission: duplicate });
          }
        }
        throw error;
      }

      res.status(duplicateSubmission ? 200 : 201).json({ ok: true, duplicate: duplicateSubmission, submission });
    } catch (error) {
      next(error);
    }
  });

  router.get("/exams/assignments/:id/result", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const assignment = await db.examAssignment.findFirst({
        where: { id: req.params.id, studentId: req.user!.id },
        include: {
          examVersion: {
            include: { questions: { orderBy: { position: "asc" } } },
          },
          submission: { include: { answers: true } },
        },
      });
      if (!assignment) return next(notFound("Exam assignment not found."));
      if (!assignment.submission) {
        return next(notFound("This exam has not been submitted yet."));
      }

      const released = assignment.submission.status === "GRADED";
      const answersByQuestion = new Map(
        assignment.submission.answers.map((answer) => [answer.examQuestionId, answer])
      );
      res.json({
        ok: true,
        result: {
          submissionId: assignment.submission.id,
          status: assignment.submission.status,
          score: released ? assignment.submission.score : null,
          maximumScore: released ? assignment.submission.maximumScore : null,
          submittedAt: assignment.submission.submittedAt,
          receivedAt: assignment.submission.receivedAt,
          questions: released ? assignment.examVersion.questions.map((question) => {
            const answer = answersByQuestion.get(question.id);
            return {
              id: question.id,
              position: question.position,
              subject: question.subject,
              topic: question.topic,
              relatedConcepts: getLearningConceptsForTopic(question.topic),
              text: question.text,
              options: parseOptions(question.options),
              correctIndex: question.correctIndex,
              explanation: question.explanation,
              marks: question.marks,
              negativeMarks: question.negativeMarks,
              selectedIndex: answer?.selectedIndex ?? null,
              isCorrect: answer?.isCorrect ?? false,
              awardedMarks: answer?.awardedMarks ?? 0,
            };
          }) : [],
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
