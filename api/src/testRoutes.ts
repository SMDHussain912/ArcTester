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
import { dailyChallengeRewardKey } from "./dailyChallenge.js";
import { isContentAudienceVisible, type ContentAudience } from "./contentAudience.js";

const AttemptIdSchema = z.object({ id: z.coerce.number().int().positive() });

export function testRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/bank", async (req: AuthedRequest, res, next) => {
    try {
      const account = req.user?.id ? await db.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, role: true, accessStatus: true, collegeCode: true, collegeName: true, branchCode: true, branchName: true },
      }) : null;
      if (req.user?.id && (!account || account.role !== "STUDENT" || account.accessStatus !== "APPROVED")) {
        return res.status(403).json({ error: "Approved student account required." });
      }
      const [catalog, approvedQuestions, publishedExamRows] = await Promise.all([
        db.subject.findMany({
          select: { id: true, name: true, topics: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
          orderBy: { name: "asc" },
        }),
        db.question.findMany({
          where: { reviewStatus: "APPROVED" },
          select: {
            id: true, subjectId: true, topicId: true, audienceScope: true,
            targetCollegeCode: true, targetCollegeName: true, targetBranchCode: true,
            targetBranchName: true, targetStudentIdsJson: true,
          },
        }),
        db.examVersionQuestion.findMany({
          where: { sourceQuestionId: { not: null }, examVersion: { is: { publishedAt: { not: null } } } },
          select: { sourceQuestionId: true },
        }),
      ]);
      const visible = approvedQuestions.filter((question) => account ? isContentAudienceVisible(question as ContentAudience, account) : question.audienceScope === "ALL");
      const subjectCounts = new Map<number, number>();
      const topicCounts = new Map<string, number>();
      for (const question of visible) {
        subjectCounts.set(question.subjectId, (subjectCounts.get(question.subjectId) ?? 0) + 1);
        if (question.topicId !== null) {
          const key = question.subjectId + ":" + question.topicId;
          topicCounts.set(key, (topicCounts.get(key) ?? 0) + 1);
        }
      }
      const examIds = new Set(publishedExamRows.flatMap((row) => row.sourceQuestionId === null ? [] : [row.sourceQuestionId]));
      const practiceSubjectCounts = new Map<number, number>();
      const practiceTopicCounts = new Map<string, number>();
      for (const question of visible.filter((item) => !examIds.has(item.id))) {
        practiceSubjectCounts.set(question.subjectId, (practiceSubjectCounts.get(question.subjectId) ?? 0) + 1);
        if (question.topicId !== null) {
          const key = question.subjectId + ":" + question.topicId;
          practiceTopicCounts.set(key, (practiceTopicCounts.get(key) ?? 0) + 1);
        }
      }
      const subjects = catalog.map((subject) => ({
        subject: subject.name,
        count: subjectCounts.get(subject.id) ?? 0,
        practiceCount: practiceSubjectCounts.get(subject.id) ?? 0,
        topics: subject.topics.map((topic) => ({
          topic: topic.name,
          count: topicCounts.get(subject.id + ":" + topic.id) ?? 0,
          practiceCount: practiceTopicCounts.get(subject.id + ":" + topic.id) ?? 0,
        })),
      }));
      return res.json({
        subjects,
        total: visible.length,
        practiceTotal: subjects.reduce((sum, subject) => sum + subject.practiceCount, 0),
        serverNow: new Date().toISOString(),
      });
    } catch (error) { next(error); }
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

  router.get("/learning/package", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const account = await db.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, role: true, accessStatus: true, collegeCode: true, collegeName: true, branchCode: true, branchName: true },
      });
      if (!account || account.role !== "STUDENT" || account.accessStatus !== "APPROVED") {
        return res.status(403).json({ error: "Approved student account required." });
      }
      // Downloadable learning content is practice-only. Published exam snapshots
      // remain in the exam delivery path and are not preloaded here.
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
          id: true, text: true, options: true, difficulty: true,
          audienceScope: true, targetCollegeCode: true, targetCollegeName: true,
          targetBranchCode: true, targetBranchName: true, targetStudentIdsJson: true,
          subject: { select: { name: true } }, topic: { select: { name: true } },
        },
      });
      const questions = rows.filter((row) => isContentAudienceVisible(row as ContentAudience, account)).map((row) => ({
        id: row.id,
        subject: row.subject.name,
        topic: row.topic?.name ?? null,
        text: row.text,
        options: JSON.parse(row.options) as string[],
        difficulty: row.difficulty,
      }));
      return res.json({
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
      const attempt = await db.attempt.findFirst({ where: { id, userId }, select: { mode: true, startedAt: true } });
      if (!attempt) throw notFound("Test not found.");
      const summary = await submitTest(db, userId, id, input);
      // Daily challenge reward is one idempotent XP event per UTC day, even if
      // the student retries the same challenge attempt or submits another run.
      const rewardKey = attempt.mode === "dailyChallenge" ? dailyChallengeRewardKey(attempt.startedAt) : "practice-test:" + id;
      await db.$transaction((tx) => awardXp(tx, userId, rewardKey, "practice"));
      // Return the detailed result with the submit response so the client avoids a second HTTP round trip.
      const result = await getResult(db, userId, id);
      res.json({ ...summary, result });
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
