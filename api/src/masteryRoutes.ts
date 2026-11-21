import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, type AuthedRequest } from "./auth.js";
import { notFound } from "./errors.js";
import { decodeOptions } from "./questions.js";
import { gradeQuestion, normalizeResponse, type QuestionType } from "./questionTypes.js";
import { BADGES, DAILY_QUESTS, nextReviewSchedule } from "./masteryService.js";

const Id = z.coerce.number().int().positive();
const ReviewAnswer = z.object({ questionId: Id, response: z.unknown() }).strict();
const utcStart = (value = new Date()) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

function publicQuestion(q: { id: number; text: string; options: string; questionType: string; promptData: string; subject: { name: string }; topic: { name: string } | null }) {
  return { id: q.id, text: q.text, options: decodeOptions(q.options), questionType: q.questionType, promptData: JSON.parse(q.promptData), subject: q.subject.name, topic: q.topic?.name ?? null };
}

export function masteryRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/learning/mastery", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const [questions, stats, pathAnswers] = await Promise.all([
        db.question.findMany({ where: { reviewStatus: "APPROVED", topicId: { not: null } }, select: { id: true, topicId: true, topic: { select: { name: true } }, subject: { select: { name: true } } } }),
        db.stat.findMany({ where: { userId }, select: { questionId: true, seen: true, wrong: true } }),
        db.pathAnswer.findMany({ where: { userId }, select: { questionId: true, isCorrect: true } }),
      ]);
      const statByQuestion = new Map<number, { seen: number; wrong: number }>();
      for (const stat of stats) statByQuestion.set(stat.questionId, { seen: stat.seen, wrong: stat.wrong });
      for (const answer of pathAnswers) {
        const current = statByQuestion.get(answer.questionId) ?? { seen: 0, wrong: 0 };
        current.seen += 1;
        if (!answer.isCorrect) current.wrong += 1;
        statByQuestion.set(answer.questionId, current);
      }
      const topics = new Map<number, { subject: string; topic: string; totalQuestions: number; answeredQuestions: number; attempts: number; correct: number }>();
      for (const q of questions) {
        if (q.topicId === null || !q.topic) continue;
        const row = topics.get(q.topicId) ?? { subject: q.subject.name, topic: q.topic.name, totalQuestions: 0, answeredQuestions: 0, attempts: 0, correct: 0 };
        row.totalQuestions += 1;
        const stat = statByQuestion.get(q.id);
        if (stat && stat.seen > 0) {
          row.answeredQuestions += 1;
          row.attempts += stat.seen;
          row.correct += Math.max(0, stat.seen - stat.wrong);
        }
        topics.set(q.topicId, row);
      }
      const result = [...topics.entries()].map(([topicId, row]) => ({
        topicId, ...row,
        coveragePct: row.totalQuestions ? Math.round(row.answeredQuestions / row.totalQuestions * 100) : 0,
        masteryPct: row.attempts ? Math.round(row.correct / row.attempts * 100) : 0,
      })).sort((a, b) => a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic));
      res.json({ topics: result });
    } catch (error) { next(error); }
  });

  router.get("/learning/practice-mistakes", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const limit = z.coerce.number().int().min(1).max(30).default(10).parse(req.query.limit);
      const now = new Date();
      const due = await db.userQuestionReview.findMany({
        where: { userId, nextReviewAt: { lte: now }, question: { reviewStatus: "APPROVED" } },
        orderBy: [{ nextReviewAt: "asc" }, { lastReviewedAt: "asc" }], take: limit,
        include: { question: { include: { subject: { select: { name: true } }, topic: { select: { name: true } } } } },
      });
      const allReviewRows = await db.userQuestionReview.findMany({ where: { userId }, select: { questionId: true } });
      const reviewedIds = new Set(allReviewRows.map((r) => r.questionId));
      const stats = await db.stat.findMany({ where: { userId, seen: { gt: 0 }, wrong: { gt: 0 } }, orderBy: { lastSeen: "asc" }, select: { questionId: true, lastSeen: true } });
      const fallbackIds = stats.filter((s) => !reviewedIds.has(s.questionId)).map((s) => s.questionId);
      const fallback = fallbackIds.length ? await db.question.findMany({
        where: { id: { in: fallbackIds }, reviewStatus: "APPROVED" },
        include: { subject: { select: { name: true } }, topic: { select: { name: true } } }, take: Math.max(0, limit - due.length),
      }) : [];
      const items = [...due.map((r) => ({ ...publicQuestion(r.question), dueAt: r.nextReviewAt.toISOString(), intervalDays: r.intervalDays, repetitions: r.repetitions })),
        ...fallback.map((q) => ({ ...publicQuestion(q), dueAt: now.toISOString(), intervalDays: 0, repetitions: 0 }))].slice(0, limit);
      res.json({ questions: items, count: items.length, dueCount: items.length });
    } catch (error) { next(error); }
  });

  router.post("/learning/practice-mistakes/answer", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const userId = req.user!.id, input = ReviewAnswer.parse(req.body), now = new Date();
      const q = await db.question.findFirst({ where: { id: input.questionId, reviewStatus: "APPROVED" }, include: { subject: { select: { name: true } }, topic: { select: { name: true } } } });
      if (!q) throw notFound("Approved question not found.");
      const response = normalizeResponse(input.response);
      const correct = gradeQuestion(q.questionType as QuestionType, q.correctIndex, JSON.parse(q.answerData), response);
      const previous = await db.userQuestionReview.findUnique({ where: { userId_questionId: { userId, questionId: q.id } } });
      const schedule = nextReviewSchedule(previous?.intervalDays ?? 0, previous?.repetitions ?? 0, correct, now);
      await db.userQuestionReview.upsert({
        where: { userId_questionId: { userId, questionId: q.id } },
        create: { userId, questionId: q.id, lastReviewedAt: now, nextReviewAt: schedule.nextReviewAt, intervalDays: schedule.intervalDays, repetitions: schedule.repetitions, reviewCount: 1, lastWasCorrect: correct },
        update: { lastReviewedAt: now, nextReviewAt: schedule.nextReviewAt, intervalDays: schedule.intervalDays, repetitions: schedule.repetitions, reviewCount: { increment: 1 }, lastWasCorrect: correct },
      });
      res.json({ correct, explanation: q.explanation, nextReviewAt: schedule.nextReviewAt.toISOString(), intervalDays: schedule.intervalDays, repetitions: schedule.repetitions });
    } catch (error) { next(error); }
  });

  router.get("/gamification/quests", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const userId = req.user!.id, today = utcStart();
      const [day, reviews, lessonsToday] = await Promise.all([
        db.gamificationDay.findUnique({ where: { userId_date: { userId, date: today } } }),
        db.userQuestionReview.count({ where: { userId, lastReviewedAt: { gte: today } } }),
        db.userLessonProgress.count({ where: { userId, completedAt: { gte: today } } }),
      ]);
      const values: Record<string, number> = { lesson: lessonsToday, practice: day?.practiceTestsDone ?? 0, mistakes: reviews };
      const quests = DAILY_QUESTS.map((quest) => ({ ...quest, progress: Math.min(quest.target, values[quest.key] ?? 0), completed: (values[quest.key] ?? 0) >= quest.target }));
      res.json({ date: today.toISOString().slice(0, 10), quests });
    } catch (error) { next(error); }
  });

  router.get("/gamification/badges", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const [state, lessons, reviewCount, mastery, existing] = await Promise.all([
        db.userGamification.upsert({ where: { userId }, create: { userId }, update: {} }),
        db.userLessonProgress.count({ where: { userId, completedAt: { not: null } } }),
        db.userQuestionReview.aggregate({ where: { userId }, _sum: { reviewCount: true } }),
        db.question.findMany({ where: { reviewStatus: "APPROVED", topicId: { not: null } }, select: { id: true, topicId: true } }),
        db.userBadge.findMany({ where: { userId }, select: { badgeKey: true, unlockedAt: true } }),
      ]);
      const stats = await db.stat.findMany({ where: { userId }, select: { questionId: true, seen: true, wrong: true } });
      const statMap = new Map(stats.map((s) => [s.questionId, s]));
      const topicTotals = new Map<number, { attempts: number; correct: number }>();
      for (const q of mastery) {
        if (q.topicId === null) continue;
        const row = topicTotals.get(q.topicId) ?? { attempts: 0, correct: 0 };
        const st = statMap.get(q.id);
        if (st) { row.attempts += st.seen; row.correct += Math.max(0, st.seen - st.wrong); }
        topicTotals.set(q.topicId, row);
      }
      const topicMaster = [...topicTotals.values()].some((v) => v.attempts >= 10 && Math.round(v.correct / v.attempts * 100) >= 80);
      const conditions: Record<string, boolean> = {
        "first-lesson": lessons >= 1, "xp-100": state.totalXp >= 100,
        "streak-7": Math.max(state.currentStreak, state.longestStreak) >= 7,
        "topic-master": topicMaster, "review-10": (reviewCount._sum.reviewCount ?? 0) >= 10,
      };
      await db.userBadge.createMany({ data: BADGES.filter((badge) => conditions[badge.key] && !existing.some((b) => b.badgeKey === badge.key)).map((badge) => ({ userId, badgeKey: badge.key })), skipDuplicates: true });
      const unlocked = await db.userBadge.findMany({ where: { userId }, orderBy: { unlockedAt: "asc" } });
      res.json({ badges: BADGES.map((badge) => ({ ...badge, unlockedAt: unlocked.find((b) => b.badgeKey === badge.key)?.unlockedAt ?? null })) });
    } catch (error) { next(error); }
  });

  return router;
}
