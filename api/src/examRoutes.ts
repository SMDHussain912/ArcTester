import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";

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

  router.get("/admin/question-bank", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const questions = await db.question.findMany({
        orderBy: [{ subject: { name: "asc" } }, { id: "asc" }],
        take: 500,
        include: { subject: { select: { name: true } }, topic: { select: { name: true } } },
      });
      res.json({
        ok: true,
        questions: questions.map((question) => ({
          id: question.id,
          subject: question.subject.name,
          topic: question.topic?.name ?? null,
          text: question.text,
          options: parseOptions(question.options),
        })),
      });
    } catch (error) {
      next(error);
    }
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
