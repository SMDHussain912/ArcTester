import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { hashQuestion, QuestionInputSchema } from "./questions.js";
import { insertQuestion } from "./questionRepository.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { importFromCsv, importFromJson, previewImport } from "./importService.js";

const CreateExamSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  instructions: z.string().trim().max(5000).default(""),
  durationMinutes: z.number().int().min(1).max(600),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  questions: z.array(
    z.object({
      questionId: z.number().int().positive(),
      marks: z.number().finite().min(0).max(100).default(1),
      negativeMarks: z.number().finite().min(0).max(100).default(0),
    })
  ).min(1).max(500),
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


const SubmitExamSchema = z
  .object({
    attemptUuid: z.string().uuid(),
    startedAt: z.string().datetime(),
    submittedAt: z.string().datetime(),
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
      const payload = format === "csv"
        ? z.string().min(1).max(8_000_000).parse(req.body?.content)
        : req.body?.questions;
      const preview = await previewImport(db, format, payload);
      res.json({ ok: true, preview });
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
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 500));
      const search = String(req.query.search ?? "").trim();
      const subjectName = String(req.query.subject ?? "").trim();
      const topicName = String(req.query.topic ?? "").trim();
      const difficulty = String(req.query.difficulty ?? "").trim();
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
    } catch (error) { next(error); }
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
    } catch (error) { next(error); }
  });

  router.get("/admin/students", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const students = await db.user.findMany({
        where: { role: "STUDENT" },
        orderBy: { email: "asc" },
        select: { id: true, email: true },
      });
      res.json({ ok: true, students });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/analytics/overview", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const [studentCount, examCount, assignments] = await Promise.all([
        db.user.count({ where: { role: "STUDENT" } }),
        db.exam.count(),
        db.examAssignment.findMany({
          orderBy: { assignedAt: "desc" },
          include: {
            student: { select: { email: true } },
            examVersion: { include: { exam: { select: { id: true, title: true } } } },
            submission: { select: { id: true, score: true, maximumScore: true, submittedAt: true, status: true } },
          },
        }),
      ]);
      const submitted = assignments.filter((item) => item.submission !== null);
      const scored = submitted.filter((item) =>
        item.submission?.score !== null && item.submission?.maximumScore !== null && (item.submission?.maximumScore ?? 0) > 0
      );
      const averagePercentage = scored.length
        ? scored.reduce((sum, item) => sum + ((item.submission!.score! / item.submission!.maximumScore!) * 100), 0) / scored.length
        : null;
      const byExam = new Map<string, { examId: string; title: string; assigned: number; submitted: number; scoreTotal: number; scored: number }>();
      for (const item of assignments) {
        const key = item.examVersion.exam.id;
        const row = byExam.get(key) ?? { examId: key, title: item.examVersion.exam.title, assigned: 0, submitted: 0, scoreTotal: 0, scored: 0 };
        row.assigned += 1;
        if (item.submission) {
          row.submitted += 1;
          if (item.submission.score !== null && item.submission.maximumScore !== null && item.submission.maximumScore > 0) {
            row.scoreTotal += (item.submission.score / item.submission.maximumScore) * 100;
            row.scored += 1;
          }
        }
        byExam.set(key, row);
      }
      res.json({
        ok: true,
        totals: {
          students: studentCount,
          exams: examCount,
          assignments: assignments.length,
          submissions: submitted.length,
          submissionRate: assignments.length ? submitted.length / assignments.length : 0,
          averagePercentage,
        },
        exams: [...byExam.values()].map((item) => ({
          examId: item.examId,
          title: item.title,
          assigned: item.assigned,
          submitted: item.submitted,
          submissionRate: item.assigned ? item.submitted / item.assigned : 0,
          averagePercentage: item.scored ? item.scoreTotal / item.scored : null,
        })).sort((a, b) => b.assigned - a.assigned),
        recentSubmissions: submitted.slice(0, 10).map((item) => ({
          submissionId: item.submission!.id,
          studentId: item.studentId,
          studentEmail: item.student.email,
          examTitle: item.examVersion.exam.title,
          submittedAt: item.submission!.submittedAt,
          score: item.submission!.score,
          maximumScore: item.submission!.maximumScore,
          status: item.submission!.status,
        })),
      });
    } catch (error) {
      next(error);
    }
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
      const answers = new Map(
        submission.answers.map((answer) => [answer.examQuestionId, answer])
      );
      res.json({
        ok: true,
        submission: {
          id: submission.id,
          status: submission.status,
          score: submission.score,
          maximumScore: submission.maximumScore,
          startedAt: submission.startedAt,
          submittedAt: submission.submittedAt,
          receivedAt: submission.receivedAt,
          student: submission.assignment.student,
          exam: {
            ...submission.assignment.examVersion.exam,
            version: submission.assignment.examVersion.version,
            durationMinutes: submission.assignment.examVersion.durationMinutes,
          },
          availableFrom: submission.assignment.availableFrom,
          dueAt: submission.assignment.dueAt,
          questions: submission.assignment.examVersion.questions.map((question) => {
            const answer = answers.get(question.id);
            return {
              id: question.id,
              position: question.position,
              subject: question.subject,
              topic: question.topic,
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
          }),
        },
      });
    } catch (error) {
      next(error);
    }
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
          marks: selection.marks,
          negativeMarks: selection.negativeMarks,
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
      next(error);
    }
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
        questions: assignment.examVersion.questions.map((question) => ({
          id: question.id,
          position: question.position,
          subject: question.subject,
          topic: question.topic,
          text: question.text,
          options: parseOptions(question.options),
          marks: question.marks,
          negativeMarks: question.negativeMarks,
        })),
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

      const questions = assignment.examVersion.questions;
      const questionIds = new Set(questions.map((question) => question.id));
      if (
        input.answers.length !== questions.length ||
        input.answers.some((answer) => !questionIds.has(answer.examQuestionId))
      ) {
        return next(badRequest("Submit one answer entry for every question in this exam."));
      }

      const answersByQuestion = new Map(
        input.answers.map((answer) => [answer.examQuestionId, answer.selectedIndex])
      );
      const answerRows = questions.map((question) => {
        const selectedIndex = answersByQuestion.get(question.id) ?? null;
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
      const startedAt = new Date(input.startedAt);
      const submittedAt = new Date(input.submittedAt);
      const now = Date.now();
      const toleranceMs = 5 * 60 * 1000;
      const durationMs = assignment.examVersion.durationMinutes * 60 * 1000;
      const suspiciousTiming =
        startedAt.getTime() > now + toleranceMs ||
        submittedAt.getTime() > now + toleranceMs ||
        submittedAt.getTime() < startedAt.getTime() ||
        submittedAt.getTime() - startedAt.getTime() > durationMs + toleranceMs ||
        (assignment.availableFrom !== null &&
          startedAt.getTime() < assignment.availableFrom.getTime() - toleranceMs) ||
        (assignment.dueAt !== null &&
          submittedAt.getTime() > assignment.dueAt.getTime() + toleranceMs);

      const submission = await db.$transaction(async (tx) => {
        const existing = await tx.examSubmission.findUnique({
          where: { assignmentId: assignment.id },
        });
        if (existing) {
          if (existing.attemptUuid === input.attemptUuid) return existing;
          throw conflict("An attempt has already been submitted for this assignment.");
        }

        const duplicateAttempt = await tx.examSubmission.findUnique({
          where: { attemptUuid: input.attemptUuid },
        });
        if (duplicateAttempt) {
          throw conflict("This attempt identifier has already been used.");
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
        return created;
      });

      res.status(201).json({ ok: true, duplicate: false, submission });
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

      const answersByQuestion = new Map(
        assignment.submission.answers.map((answer) => [answer.examQuestionId, answer])
      );
      res.json({
        ok: true,
        result: {
          submissionId: assignment.submission.id,
          status: assignment.submission.status,
          score: assignment.submission.score,
          maximumScore: assignment.submission.maximumScore,
          submittedAt: assignment.submission.submittedAt,
          receivedAt: assignment.submission.receivedAt,
          questions: assignment.examVersion.questions.map((question) => {
            const answer = answersByQuestion.get(question.id);
            return {
              id: question.id,
              position: question.position,
              subject: question.subject,
              topic: question.topic,
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
          }),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
