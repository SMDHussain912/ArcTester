import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { hashQuestion, QuestionInputSchema } from "./questions.js";
import { insertQuestion } from "./questionRepository.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { importFromCsv, importFromJson, previewImport } from "./importService.js";
import {
  QUESTION_ANALYTICS_MINIMUM_ANSWERS,
  QUESTION_ANALYTICS_WEAK_ACCURACY,
} from "./analytics.js";

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
}).refine((input) => input.questions.every((question) => question.negativeMarks <= question.marks), {
  message: "Negative marks cannot exceed the marks awarded for a correct answer.",
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
      const [studentCount, examCount, assignments, practiceAttempts, gradedSubmissions] = await Promise.all([
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
        db.attempt.findMany({
          where: { finishedAt: { not: null }, user: { role: "STUDENT" } },
          select: {
            userId: true,
            answers: {
              select: {
                questionId: true,
                chosen: true,
                isCorrect: true,
                subjectSnapshot: true,
                topicSnapshot: true,
                difficultySnapshot: true,
                question: {
                  select: {
                    difficulty: true,
                    subject: { select: { name: true } },
                    topic: { select: { name: true } },
                  },
                },
              },
            },
          },
        }),
        db.examSubmission.findMany({
          where: { status: "GRADED", assignment: { student: { role: "STUDENT" } } },
          select: {
            answers: {
              select: {
                selectedIndex: true,
                isCorrect: true,
                awardedMarks: true,
                examQuestion: { select: { subject: true, topic: true, marks: true } },
              },
            },
          },
        }),
      ]);
      const submitted = assignments.filter((item) => item.submission !== null);
      const scored = submitted.filter((item) =>
        item.submission?.status === "GRADED" && item.submission.score !== null &&
        item.submission.maximumScore !== null && item.submission.maximumScore > 0
      );
      let practiceCorrect = 0;
      let practiceIncorrect = 0;
      let practiceUnanswered = 0;
      const practiceBySubject = new Map<string, { correct: number; incorrect: number; unanswered: number }>();
      const practiceByTopic = new Map<string, { subject: string; topic: string | null; correct: number; incorrect: number; unanswered: number }>();
      const practiceByQuestion = new Map<number, {
        questionId: number; subject: string; topic: string | null; difficulty: string;
        correct: number; incorrect: number; unanswered: number; studentIds: Set<number>;
      }>();
      for (const attempt of practiceAttempts) {
        for (const answer of attempt.answers) {
          const hasSnapshot = answer.subjectSnapshot.length > 0;
          const subject = hasSnapshot ? answer.subjectSnapshot : answer.question.subject.name;
          const topic = hasSnapshot ? answer.topicSnapshot : answer.question.topic?.name ?? null;
          if (answer.chosen === null) practiceUnanswered += 1;
          else if (answer.isCorrect) practiceCorrect += 1;
          else practiceIncorrect += 1;
          const row = practiceBySubject.get(subject) ?? { correct: 0, incorrect: 0, unanswered: 0 };
          if (answer.chosen === null) row.unanswered += 1;
          else if (answer.isCorrect) row.correct += 1;
          else row.incorrect += 1;
          practiceBySubject.set(subject, row);
          const topicKey = JSON.stringify([subject, topic]);
          const topicRow = practiceByTopic.get(topicKey) ?? { subject, topic, correct: 0, incorrect: 0, unanswered: 0 };
          if (answer.chosen === null) topicRow.unanswered += 1;
          else if (answer.isCorrect) topicRow.correct += 1;
          else topicRow.incorrect += 1;
          practiceByTopic.set(topicKey, topicRow);
          const questionRow = practiceByQuestion.get(answer.questionId) ?? {
            questionId: answer.questionId,
            subject,
            topic,
            difficulty: answer.difficultySnapshot || answer.question.difficulty,
            correct: 0,
            incorrect: 0,
            unanswered: 0,
            studentIds: new Set<number>(),
          };
          if (answer.chosen === null) {
            questionRow.unanswered += 1;
          } else {
            questionRow.studentIds.add(attempt.userId);
            if (answer.isCorrect) questionRow.correct += 1;
            else questionRow.incorrect += 1;
          }
          practiceByQuestion.set(answer.questionId, questionRow);
        }
      }
      const practiceAnswered = practiceCorrect + practiceIncorrect;
      const minimumQuestionAnswers = QUESTION_ANALYTICS_MINIMUM_ANSWERS;
      const minimumQuestionStudents = 3;
      const weakQuestionAccuracy = QUESTION_ANALYTICS_WEAK_ACCURACY;
      const questionPerformance = [...practiceByQuestion.values()].map((row) => {
        const sampleSize = row.correct + row.incorrect;
        const accuracy = sampleSize > 0 ? row.correct / sampleSize : null;
        const uniqueStudents = row.studentIds.size;
        const sufficientData = sampleSize >= minimumQuestionAnswers && uniqueStudents >= minimumQuestionStudents;
        const publicRow = {
          questionId: row.questionId,
          subject: row.subject,
          topic: row.topic,
          difficulty: row.difficulty,
          correct: row.correct,
          incorrect: row.incorrect,
          unanswered: row.unanswered,
        };
        return {
          ...publicRow,
          sampleSize,
          uniqueStudents,
          accuracy,
          sufficientData,
          weak: sufficientData && accuracy !== null && accuracy < weakQuestionAccuracy,
        };
      }).sort((a, b) => Number(b.weak) - Number(a.weak) ||
        (a.accuracy ?? 1) - (b.accuracy ?? 1) || b.sampleSize - a.sampleSize);
      const formalBySubject = new Map<string, { correct: number; incorrect: number; unanswered: number; awardedMarks: number; maximumMarks: number }>();
      const formalByTopic = new Map<string, { subject: string; topic: string | null; correct: number; incorrect: number; unanswered: number; awardedMarks: number; maximumMarks: number }>();
      let formalCorrect = 0;
      let formalIncorrect = 0;
      let formalUnanswered = 0;
      for (const submission of gradedSubmissions) {
        for (const answer of submission.answers) {
          const subject = answer.examQuestion.subject;
          const topic = answer.examQuestion.topic;
          const row = formalBySubject.get(subject) ?? { correct: 0, incorrect: 0, unanswered: 0, awardedMarks: 0, maximumMarks: 0 };
          if (answer.selectedIndex === null) { formalUnanswered += 1; row.unanswered += 1; }
          else if (answer.isCorrect) { formalCorrect += 1; row.correct += 1; }
          else { formalIncorrect += 1; row.incorrect += 1; }
          row.awardedMarks += answer.awardedMarks;
          row.maximumMarks += answer.examQuestion.marks;
          formalBySubject.set(subject, row);
          const topicKey = JSON.stringify([subject, topic]);
          const topicRow = formalByTopic.get(topicKey) ?? { subject, topic, correct: 0, incorrect: 0, unanswered: 0, awardedMarks: 0, maximumMarks: 0 };
          if (answer.selectedIndex === null) topicRow.unanswered += 1;
          else if (answer.isCorrect) topicRow.correct += 1;
          else topicRow.incorrect += 1;
          topicRow.awardedMarks += answer.awardedMarks;
          topicRow.maximumMarks += answer.examQuestion.marks;
          formalByTopic.set(topicKey, topicRow);
        }
      }
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
          if (item.submission.status === "GRADED" && item.submission.score !== null && item.submission.maximumScore !== null && item.submission.maximumScore > 0) {
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
        practice: {
          completedAttempts: practiceAttempts.length,
          questions: practiceCorrect + practiceIncorrect + practiceUnanswered,
          correct: practiceCorrect,
          incorrect: practiceIncorrect,
          unanswered: practiceUnanswered,
          accuracy: practiceAnswered > 0 ? practiceCorrect / practiceAnswered : null,
          subjects: [...practiceBySubject.entries()].map(([subject, row]) => ({
            subject,
            ...row,
            accuracy: row.correct + row.incorrect > 0
              ? row.correct / (row.correct + row.incorrect)
              : null,
          })),
          topics: [...practiceByTopic.values()].map((row) => ({
            ...row,
            accuracy: row.correct + row.incorrect > 0
              ? row.correct / (row.correct + row.incorrect)
              : null,
          })),
          questionPerformance: {
            minimumAnswers: minimumQuestionAnswers,
            minimumStudents: minimumQuestionStudents,
            weakAccuracyThreshold: weakQuestionAccuracy,
            insufficientSampleCount: questionPerformance.filter((row) => !row.sufficientData).length,
            questions: questionPerformance,
          },
        },
        formalExams: {
          graded: gradedSubmissions.length,
          reviewRequired: submitted.filter((item) => item.submission?.status === "REVIEW_REQUIRED").length,
          correct: formalCorrect,
          incorrect: formalIncorrect,
          unanswered: formalUnanswered,
          subjects: [...formalBySubject.entries()].map(([subject, row]) => ({
            subject,
            ...row,
            accuracy: row.correct + row.incorrect > 0
              ? row.correct / (row.correct + row.incorrect)
              : null,
          })),
          topics: [...formalByTopic.values()].map((row) => ({
            ...row,
            accuracy: row.correct + row.incorrect > 0
              ? row.correct / (row.correct + row.incorrect)
              : null,
          })),
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
      if (!version) return res.json({ ok: true, report: { title: exam.title, version: null, assigned: 0, started: 0, submitted: 0, averagePercentage: null, subjects: [], questions: [] } });
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
      if (assignment.session?.startedAt && now.getTime() > assignment.session.startedAt.getTime() + assignment.examVersion.durationMinutes * 60000 + assignment.session.pausedDurationMs + 60000) {
        await db.examSession.update({ where: { id: assignment.session.id }, data: { status: "EXPIRED", endedAt: now } });
        return next(conflict("The exam duration has expired. Contact the invigilator."));
      }
      const session = assignment.session
        ? await db.examSession.update({
            where: { id: assignment.session.id },
            data: { status: "ACTIVE", lastHeartbeatAt: now, lastActivityAt: now },
          })
        : await db.examSession.create({
            data: {
              assignmentId: assignment.id, studentId: req.user!.id, status: "ACTIVE",
              startedAt: now, lastHeartbeatAt: now, lastActivityAt: now,
              events: { create: { actorId: req.user!.id, type: "SESSION_STARTED", detail: "Candidate started the assigned examination." } },
            },
          });
      if (assignment.session) await db.examSessionEvent.create({ data: { sessionId: session.id, actorId: req.user!.id, type: "SESSION_RESUMED", detail: "Candidate resumed an existing session." } });
      const deadline = session.startedAt ? new Date(session.startedAt.getTime() + assignment.examVersion.durationMinutes * 60000 + session.pausedDurationMs) : null;
      res.json({ ok: true, session: { id: session.id, status: session.status, startedAt: session.startedAt, lastHeartbeatAt: session.lastHeartbeatAt, serverTime: now, deadline } });
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
      if (deadline && now.getTime() > deadline.getTime() + 60000) {
        await db.examSession.update({ where: { id: assignment.session.id }, data: { status: "EXPIRED", endedAt: now } });
        await db.examSessionEvent.create({ data: { sessionId: assignment.session.id, actorId: req.user!.id, type: "SESSION_EXPIRED", detail: "Server-side examination deadline elapsed." } });
        return next(conflict("The examination time has expired."));
      }
      if (assignment.dueAt && now > assignment.dueAt) return next(forbidden("The examination submission deadline has passed."));
      const stale = assignment.session.lastHeartbeatAt && now.getTime() - assignment.session.lastHeartbeatAt.getTime() > 90000;
      const session = await db.examSession.update({
        where: { id: assignment.session.id },
        data: {
          lastHeartbeatAt: now, lastActivityAt: now, heartbeatCount: { increment: 1 },
          ...(input.event === "FOCUS_LOST" ? { focusLossCount: { increment: 1 } } : {}),
          ...(stale ? { disconnectCount: { increment: 1 } } : {}),
        },
      });
      if (input.event !== "HEARTBEAT" || stale) {
        await db.examSessionEvent.create({
          data: { sessionId: session.id, actorId: req.user!.id, type: stale ? "CONNECTION_RESTORED" : input.event, detail: stale ? "Heartbeat resumed after a connection gap." : "Candidate browser activity signal." },
        });
      }
      const effectiveDeadline = session.startedAt ? new Date(session.startedAt.getTime() + assignment.examVersion.durationMinutes * 60000 + session.pausedDurationMs) : null;
      res.json({ ok: true, serverTime: now, deadline: effectiveDeadline, sessionStatus: session.status });
    } catch (error) { next(error); }
  });

  router.get("/admin/exams/live-sessions", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const sessions = await db.examSession.findMany({
        where: { status: { in: ["ACTIVE", "PAUSED", "INTERRUPTED"] } },
        orderBy: { lastHeartbeatAt: "desc" },
        include: {
          student: { select: { id: true, email: true } },
          assignment: { include: { examVersion: { include: { exam: { select: { id: true, title: true } } } }, submission: { select: { id: true, status: true } } } },
          events: { orderBy: { createdAt: "desc" }, take: 12, include: { actor: { select: { email: true, role: true } } } },
        },
      });
      const now = Date.now();
      res.json({ ok: true, serverTime: new Date(now), sessions: sessions.map((session) => ({
        id: session.id, status: session.status, student: session.student,
        exam: session.assignment.examVersion.exam, assignmentId: session.assignmentId,
        startedAt: session.startedAt, lastHeartbeatAt: session.lastHeartbeatAt,
        connectivity: session.status === "ACTIVE" && session.lastHeartbeatAt && now - session.lastHeartbeatAt.getTime() <= 90000 ? "CONNECTED" : "STALE",
        heartbeatCount: session.heartbeatCount, focusLossCount: session.focusLossCount,
        disconnectCount: session.disconnectCount, submission: session.assignment.submission,
        events: session.events,
      })) });
    } catch (error) { next(error); }
  });

  router.get("/admin/exams/attendance", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const assignments = await db.examAssignment.findMany({
        orderBy: { assignedAt: "desc" },
        include: {
          student: { select: { id: true, email: true } },
          examVersion: { include: { exam: { select: { id: true, title: true } }, _count: { select: { questions: true } } } },
          session: { select: { id: true, status: true, startedAt: true, lastHeartbeatAt: true, endedAt: true, heartbeatCount: true, focusLossCount: true, disconnectCount: true } },
          submission: { select: { id: true, status: true, submittedAt: true, score: true, maximumScore: true } },
        },
      });
      const now = Date.now();
      res.json({ ok: true, serverTime: new Date(now), attendance: assignments.map((item) => ({
        assignmentId: item.id, candidate: item.student, exam: item.examVersion.exam,
        version: item.examVersion.version, questionCount: item.examVersion._count.questions,
        assignedAt: item.assignedAt, availableFrom: item.availableFrom, dueAt: item.dueAt,
        attendanceStatus: item.submission ? "SUBMITTED" : item.session?.startedAt ? item.session.status : "NOT_STARTED",
        connectivity: item.session?.status === "ACTIVE" && item.session.lastHeartbeatAt && now - item.session.lastHeartbeatAt.getTime() <= 90000 ? "CONNECTED" : item.session?.startedAt ? "STALE_OR_INACTIVE" : "NOT_STARTED",
        session: item.session, submission: item.submission,
      })) });
    } catch (error) { next(error); }
  });

  router.post("/admin/exams/sessions/:id/action", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const input = z.object({ action: z.enum(["PAUSE", "RESUME", "TERMINATE"]), reason: z.string().trim().max(300).default("") }).parse(req.body);
      const session = await db.examSession.findUnique({ where: { id: req.params.id } });
      if (!session) return next(notFound("Exam session not found."));
      if (["COMPLETED", "TERMINATED", "EXPIRED"].includes(session.status)) return next(conflict("This exam session is already closed."));
      const now = new Date();
      const status = input.action === "PAUSE" ? "PAUSED" : input.action === "RESUME" ? "ACTIVE" : "TERMINATED";
      const updated = await db.examSession.update({
        where: { id: session.id },
        data: {
          status, lastActivityAt: now,
          ...(input.action === "PAUSE" ? { pausedAt: now } : {}),
          ...(input.action === "RESUME" && session.pausedAt ? { pausedDurationMs: { increment: now.getTime() - session.pausedAt.getTime() }, pausedAt: null } : {}),
          ...(input.action === "TERMINATE" ? { endedAt: now, pausedAt: null } : {}),
        },
      });
      await db.examSessionEvent.create({
        data: { sessionId: session.id, actorId: req.user!.id, type: "INVIGILATOR_" + input.action, detail: input.reason || "Action taken by invigilator." },
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
      const paperQuestions = [...assignment.examVersion.questions];
      if (assignment.examVersion.shuffleQuestions) {
        paperQuestions.sort((left, right) => {
          const leftKey = createHash("sha256").update(assignment.id + ":" + left.id).digest("hex");
          const rightKey = createHash("sha256").update(assignment.id + ":" + right.id).digest("hex");
          return leftKey.localeCompare(rightKey);
        });
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
        questions: paperQuestions.map((question, position) => {
          const originalOptions = parseOptions(question.options);
          const optionOrder = assignment.examVersion.shuffleOptions
            ? stableOptionOrder(assignment.id, question.id, originalOptions.length)
            : originalOptions.map((_, index) => index);
          return {
            id: question.id,
            position,
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

      if (!assignment.session || assignment.session.status !== "ACTIVE" || !assignment.session.startedAt) {
        return next(conflict("Start or resume the server exam session before submitting."));
      }
      const serverSubmittedAt = new Date();
      const serverStartedAt = assignment.session.startedAt;
      if (assignment.dueAt && serverSubmittedAt > assignment.dueAt) {
        return next(forbidden("The examination submission deadline has passed."));
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
      const durationMs = assignment.examVersion.durationMinutes * 60 * 1000 + assignment.session.pausedDurationMs;
      const staleHeartbeat = !assignment.session.lastHeartbeatAt ||
        serverSubmittedAt.getTime() - assignment.session.lastHeartbeatAt.getTime() > 90000;
      const suspiciousTiming =
        serverSubmittedAt.getTime() > startedAt.getTime() + durationMs + 60000 ||
        staleHeartbeat ||
        (assignment.availableFrom !== null && startedAt < assignment.availableFrom) ||
        (assignment.dueAt !== null && submittedAt > assignment.dueAt) ||
        new Date(input.startedAt).getTime() < startedAt.getTime() - 60000 ||
        new Date(input.startedAt).getTime() > startedAt.getTime() + 60000;

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
        await tx.examSession.update({
          where: { id: assignment.session!.id },
          data: { status: "COMPLETED", endedAt: serverSubmittedAt, lastActivityAt: serverSubmittedAt },
        });
        await tx.examSessionEvent.create({
          data: { sessionId: assignment.session!.id, actorId: req.user!.id, type: "SUBMITTED", detail: suspiciousTiming ? "Submission retained for invigilator review due to timing or connectivity signals." : "Candidate submitted the examination." },
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
