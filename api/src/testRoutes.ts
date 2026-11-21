import { Router } from "express";
import { z } from "zod";
import {
  CreateTestSchema,
  createTest,
  getAttemptView,
  getResult,
  saveTestAnswers,
  submitTest,
  SubmitTestSchema,
} from "./testService.js";
import type { PrismaClient } from "@prisma/client";
import { analyticsRouter } from "./analyticsRoutes.js";
import { requireAuth, type AuthedRequest } from "./auth.js";
import { notFound } from "./errors.js";
import { getLearningConcept, listLearningConcepts } from "./learningConcepts.js";
import { awardXp } from "./gamificationService.js";

const AttemptIdSchema = z.object({ id: z.coerce.number().int().positive() });

export function testRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/bank", async (_req, res, next) => {
    try {
      const rows = await db.subject.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { questions: { where: { reviewStatus: "APPROVED" } } } },
          topics: {
            orderBy: { name: "asc" },
            select: { id: true, name: true, _count: { select: { questions: { where: { reviewStatus: "APPROVED" } } } } },
          },
        },
        orderBy: { name: "asc" },
      });
      const publishedExamRows = await db.examVersionQuestion.findMany({
        where: {
          sourceQuestionId: { not: null },
          examVersion: { is: { publishedAt: { not: null } } },
        },
        select: { sourceQuestionId: true },
      });
      const examQuestionIds = publishedExamRows.flatMap((row) => row.sourceQuestionId === null ? [] : [row.sourceQuestionId]);
      const practiceRows = await db.question.findMany({
        where: { reviewStatus: "APPROVED", id: { notIn: examQuestionIds } },
        select: { subjectId: true, topicId: true },
      });
      const practiceSubjectCounts = new Map<number, number>();
      const practiceTopicCounts = new Map<string, number>();
      for (const question of practiceRows) {
        practiceSubjectCounts.set(question.subjectId, (practiceSubjectCounts.get(question.subjectId) ?? 0) + 1);
        if (question.topicId !== null) {
          const key = question.subjectId + ":" + question.topicId;
          practiceTopicCounts.set(key, (practiceTopicCounts.get(key) ?? 0) + 1);
        }
      }
      const subjects = rows.map((r) => ({
        subject: r.name,
        count: r._count.questions,
        practiceCount: practiceSubjectCounts.get(r.id) ?? 0,
        topics: r.topics.map((topic) => ({
          topic: topic.name,
          count: topic._count.questions,
          practiceCount: practiceTopicCounts.get(r.id + ":" + topic.id) ?? 0,
        })),
      }));
      res.json({
        subjects,
        total: subjects.reduce((sum, s) => sum + s.count, 0),
        practiceTotal: subjects.reduce((sum, s) => sum + s.practiceCount, 0),
        serverNow: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/learning/concepts", requireAuth, async (req, res, next) => {
    try {
      const query = z.object({
        q: z.string().trim().max(100).optional(),
        subject: z.string().trim().min(1).max(80).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(50),
      }).parse(req.query);
      const concepts = listLearningConcepts({ query: query.q, subject: query.subject, limit: query.limit });
      res.json({ total: concepts.length, concepts });
    } catch (error) {
      next(error);
    }
  });

  router.get("/learning/concepts/:slug", requireAuth, async (req, res, next) => {
    try {
      const params = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) }).parse(req.params);
      const concept = getLearningConcept(params.slug);
      if (!concept) return next(notFound("That learning concept does not exist."));
      res.json(concept);
    } catch (error) {
      next(error);
    }
  });

  router.get("/learning/package", requireAuth, async (_req, res, next) => {
    try {
      // Downloadable learning content is practice-only. Published exam
      // snapshots remain in the exam delivery path and are not preloaded here.
      const publishedExamRows = await db.examVersionQuestion.findMany({
        where: {
          sourceQuestionId: { not: null },
          examVersion: { is: { publishedAt: { not: null } } },
        },
        select: { sourceQuestionId: true },
      });
      const publishedExamQuestionIds = publishedExamRows.flatMap((row) =>
        row.sourceQuestionId === null ? [] : [row.sourceQuestionId],
      );
      const rows = await db.question.findMany({
        where: { reviewStatus: "APPROVED", id: { notIn: publishedExamQuestionIds } },
        orderBy: [{ subject: { name: "asc" } }, { topic: { name: "asc" } }, { id: "asc" }],
        select: {
          id: true,
          text: true,
          options: true,
          difficulty: true,
          subject: { select: { name: true } },
          topic: { select: { name: true } },
        },
      });
      const questions = rows.map((row) => ({
        id: row.id,
        subject: row.subject.name,
        topic: row.topic?.name ?? null,
        text: row.text,
        options: JSON.parse(row.options) as string[],
        difficulty: row.difficulty,
      }));
      res.json({
        schemaVersion: 3,
        practiceOnly: true,
        exportedAt: new Date().toISOString(),
        total: questions.length,
        subjects: [...new Set(questions.map((question) => question.subject))],
        questions,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/tests",
    requireAuth,
    async (req, res, next) => {
    try {
      const input = CreateTestSchema.parse(req.body);
      const created = await createTest(db, (req as AuthedRequest).user!.id, input);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.put(
    "/tests/:id/answers",
    requireAuth,
    async (req, res, next) => {
      try {
        const { id } = AttemptIdSchema.parse(req.params);
        const input = SubmitTestSchema.parse(req.body);
        const saved = await saveTestAnswers(db, (req as AuthedRequest).user!.id, id, input);
        res.json(saved);
      } catch (error) { next(error); }
    },
  );

  router.post(
    "/tests/:id/submit",
    requireAuth,
    async (req, res, next) => {
    try {
      const { id } = AttemptIdSchema.parse(req.params);
      const input = SubmitTestSchema.parse(req.body);
      const userId = (req as AuthedRequest).user!.id;
      const summary = await submitTest(db, userId, id, input);
      await db.$transaction((tx) => awardXp(tx, userId, "practice-test:" + id, "practice"));
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/tests/:id/result",
    requireAuth,
    async (req, res, next) => {
    try {
      const { id } = AttemptIdSchema.parse(req.params);
      const result = await getResult(db, (req as AuthedRequest).user!.id, id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/tests/:id",
    requireAuth,
    async (req, res, next) => {
    try {
      const { id } = AttemptIdSchema.parse(req.params);
      const view = await getAttemptView(db, (req as AuthedRequest).user!.id, id);
      res.json(view);
    } catch (error) {
      next(error);
    }
  });

  router.use("/analytics", analyticsRouter(db));

  return router;
}
