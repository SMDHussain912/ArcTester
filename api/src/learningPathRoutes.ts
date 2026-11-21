import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, requireAdmin, type AuthedRequest } from "./auth.js";
import { badRequest, forbidden, notFound } from "./errors.js";
import { decodeOptions } from "./questions.js";
import { gradeQuestion, normalizeResponse, type QuestionType } from "./questionTypes.js";
import { awardXp } from "./gamificationService.js";

const Id = z.coerce.number().int().positive();
const AnswerInput = z.object({ questionId: Id, response: z.unknown() }).strict();
type PathQuestionPublicInput = { id: number; subject: { name: string }; topic: { name: string } | null; text: string; options: string | null; questionType: string; promptData: string };
export const toPathPublicQuestion = (q: PathQuestionPublicInput) => ({
  id: q.id, subject: q.subject.name, topic: q.topic?.name ?? null,
  text: q.text, options: decodeOptions(q.options ?? "[]"), questionType: q.questionType,
  promptData: JSON.parse(q.promptData),
});
const completed = (progress: { completedAt: Date | null } | null | undefined) => Boolean(progress?.completedAt);
const passed = (progress: { passedAt: Date | null } | null | undefined) => Boolean(progress?.passedAt);

async function lessonState(db: PrismaClient, userId: number, subjectName?: string) {
  const subjects = await db.subject.findMany({
    where: subjectName ? { name: subjectName } : undefined,
    orderBy: { name: "asc" },
    include: { pathUnits: { orderBy: { position: "asc" }, include: {
      lessons: { orderBy: { position: "asc" }, include: {
        progress: { where: { userId } },
        _count: { select: { questions: true } },
      } },
      testProgress: { where: { userId } },
    } } },
  });
  return subjects.map((subject) => {
    let previousUnitPassed = true;
    const units = subject.pathUnits.map((unit) => {
      const testProgress = unit.testProgress[0] ?? null;
      const unitUnlocked = previousUnitPassed;
      let previousLessonDone = true;
      const lessons = unit.lessons.map((lesson) => {
        const progress = lesson.progress[0] ?? null;
        const unlocked = unitUnlocked && previousLessonDone;
        previousLessonDone = completed(progress);
        return { id: lesson.id, position: lesson.position, title: lesson.title,
          questionCount: lesson._count.questions,
          status: completed(progress) ? "completed" : unlocked ? "available" : "locked",
          completedAt: progress?.completedAt ?? null, bestScorePct: progress?.bestScorePct ?? 0,
          attempts: progress?.attempts ?? 0 };
      });
      const testUnlocked = unitUnlocked && lessons.length > 0 && lessons.every((l) => l.status === "completed");
      previousUnitPassed = passed(testProgress);
      return { id: unit.id, subjectId: unit.subjectId, topicId: unit.topicId,
        position: unit.position, title: unit.title, status: !unitUnlocked ? "locked" : passed(testProgress) ? "completed" : "available",
        lessons, unitTest: { status: passed(testProgress) ? "completed" : testUnlocked ? "available" : "locked",
          passedAt: testProgress?.passedAt ?? null, bestScorePct: testProgress?.bestScorePct ?? 0,
          attempts: testProgress?.attempts ?? 0 } };
    });
    return { id: subject.id, subject: subject.name, units };
  });
}

async function ensureLessonUnlocked(db: PrismaClient, userId: number, lessonId: number) {
  const lesson = await db.pathLesson.findUnique({ where: { id: lessonId }, include: {
    unit: { include: { lessons: { orderBy: { position: "asc" }, include: { progress: { where: { userId } } },
      }, testProgress: { where: { userId } } } },
    questions: { orderBy: { position: "asc" } },
  } });
  if (!lesson) throw notFound("Lesson not found.");
  const unit = lesson.unit;
  const priorUnit = await db.pathUnit.findFirst({ where: { subjectId: unit.subjectId, position: { lt: unit.position } }, orderBy: { position: "desc" }, include: { testProgress: { where: { userId } } } });
  if (priorUnit && !passed(priorUnit.testProgress[0])) throw forbidden("This unit is locked.");
  const priorLesson = unit.lessons.find((item) => item.position < lesson.position);
  if (priorLesson && !completed(priorLesson.progress[0])) throw forbidden("Complete the previous lesson first.");
  return lesson;
}

async function ensureUnitTestUnlocked(db: PrismaClient, userId: number, unitId: number) {
  const unit = await db.pathUnit.findUnique({ where: { id: unitId }, include: {
    lessons: { orderBy: { position: "asc" }, include: { progress: { where: { userId } }, questions: { orderBy: { position: "asc" } } } },
    testProgress: { where: { userId } },
  } });
  if (!unit) throw notFound("Unit not found.");
  const priorUnit = await db.pathUnit.findFirst({ where: { subjectId: unit.subjectId, position: { lt: unit.position } }, orderBy: { position: "desc" }, include: { testProgress: { where: { userId } } } });
  if (priorUnit && !passed(priorUnit.testProgress[0])) throw forbidden("This unit is locked.");
  if (!unit.lessons.length || unit.lessons.some((lesson) => !completed(lesson.progress[0]))) throw forbidden("Complete every lesson in this unit first.");
  return unit;
}

export function learningPathRouter(db: PrismaClient): Router {
  const router = Router();
  router.get("/path", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const query = z.object({ subject: z.string().trim().min(1).max(100).optional() }).parse(req.query);
      res.json({ subjects: await lessonState(db, req.user!.id, query.subject) });
    } catch (e) { next(e); }
  });
  router.get("/path/lessons/:id", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const { id } = z.object({ id: Id }).parse(req.params);
      const lesson = await ensureLessonUnlocked(db, req.user!.id, id);
      if (lesson.questions.length !== 10) throw badRequest("This lesson is not fully built yet.");
      const questions = await db.question.findMany({ where: { id: { in: lesson.questions.map((x) => x.questionId) }, reviewStatus: "APPROVED" },
        include: { subject: { select: { name: true } }, topic: { select: { name: true } } } });
      const byId = new Map(questions.map((q) => [q.id, q]));
      res.json({ lessonId: id, questions: lesson.questions.map((link) => byId.get(link.questionId)).filter((q): q is NonNullable<typeof q> => q !== undefined).map(toPathPublicQuestion) });
    } catch (e) { next(e); }
  });
  router.post("/path/lessons/:id/answer", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const { id } = z.object({ id: Id }).parse(req.params), input = AnswerInput.parse(req.body);
      const lesson = await ensureLessonUnlocked(db, req.user!.id, id);
      if (!lesson.questions.some((q) => q.questionId === input.questionId)) throw badRequest("Question does not belong to this lesson.");
      const q = await db.question.findFirst({ where: { id: input.questionId, reviewStatus: "APPROVED" } });
      if (!q) throw notFound("Question not found.");
      const response = normalizeResponse(input.response);
      const correct = gradeQuestion(q.questionType as QuestionType, q.correctIndex, JSON.parse(q.answerData), response);
      await db.pathAnswer.upsert({ where: { userId_scopeKey_questionId: { userId: req.user!.id, scopeKey: "lesson:" + id, questionId: q.id } },
        create: { userId: req.user!.id, lessonId: id, unitId: null, scopeKey: "lesson:" + id, questionId: q.id, response: JSON.stringify(response), isCorrect: correct },
        update: { response: JSON.stringify(response), isCorrect: correct } });
      res.json({ correct, explanation: q.explanation });
    } catch (e) { next(e); }
  });
  router.post("/path/lessons/:id/complete", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const { id } = z.object({ id: Id }).parse(req.params), userId = req.user!.id;
      const lesson = await ensureLessonUnlocked(db, userId, id);
      const answers = await db.pathAnswer.findMany({ where: { userId, lessonId: id, unitId: null } });
      if (lesson.questions.length !== 10 || answers.length < 10) throw badRequest("Answer all 10 lesson questions before completing.");
      const score = Math.round(answers.filter((a) => a.isCorrect && lesson.questions.some((q) => q.questionId === a.questionId)).length / 10 * 100);
      const old = await db.userLessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId: id } } });
      const progress = await db.userLessonProgress.upsert({ where: { userId_lessonId: { userId, lessonId: id } },
        create: { userId, lessonId: id, completedAt: new Date(), bestScorePct: score, attempts: 1 },
        update: { completedAt: new Date(), bestScorePct: Math.max(old?.bestScorePct ?? 0, score), attempts: { increment: 1 } } });
      if (!old?.completedAt) await db.$transaction((tx) => awardXp(tx, userId, "lesson-complete:" + id, "lesson"));
      res.json({ completed: true, scorePct: score, progress, newlyUnlocked: { type: "lesson-or-unit-test" } });
    } catch (e) { next(e); }
  });
  router.get("/path/units/:id/test", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const { id } = z.object({ id: Id }).parse(req.params), unit = await ensureUnitTestUnlocked(db, req.user!.id, id);
      const links = unit.lessons.flatMap((l) => l.questions).slice(0, 10);
      if (links.length !== 10) throw badRequest("Unit test is not fully built yet.");
      const rows = await db.question.findMany({ where: { id: { in: links.map((x) => x.questionId) }, reviewStatus: "APPROVED" },
        include: { subject: { select: { name: true } }, topic: { select: { name: true } } } });
      const map = new Map(rows.map((q) => [q.id, q]));
      res.json({ unitId: id, questions: links.map((x) => map.get(x.questionId)).filter((q): q is NonNullable<typeof q> => q !== undefined).map(toPathPublicQuestion) });
    } catch (e) { next(e); }
  });
  router.post("/path/units/:id/test/answer", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const { id } = z.object({ id: Id }).parse(req.params), input = AnswerInput.parse(req.body), userId = req.user!.id;
      const unit = await ensureUnitTestUnlocked(db, userId, id);
      const links = unit.lessons.flatMap((l) => l.questions).slice(0, 10);
      if (!links.some((x) => x.questionId === input.questionId)) throw badRequest("Question does not belong to this unit test.");
      const q = await db.question.findFirst({ where: { id: input.questionId, reviewStatus: "APPROVED" } });
      if (!q) throw notFound("Question not found.");
      const response = normalizeResponse(input.response), correct = gradeQuestion(q.questionType as QuestionType, q.correctIndex, JSON.parse(q.answerData), response);
      await db.pathAnswer.upsert({ where: { userId_scopeKey_questionId: { userId, scopeKey: "unit:" + id, questionId: q.id } },
        create: { userId, lessonId: null, unitId: id, scopeKey: "unit:" + id, questionId: q.id, response: JSON.stringify(response), isCorrect: correct },
        update: { response: JSON.stringify(response), isCorrect: correct } });
      res.json({ correct, explanation: q.explanation });
    } catch (e) { next(e); }
  });
  router.post("/path/units/:id/test/complete", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const { id } = z.object({ id: Id }).parse(req.params), userId = req.user!.id;
      const unit = await ensureUnitTestUnlocked(db, userId, id), links = unit.lessons.flatMap((l) => l.questions).slice(0, 10);
      const answers = await db.pathAnswer.findMany({ where: { userId, unitId: id, lessonId: null } });
      if (links.length !== 10 || answers.filter((a) => links.some((q) => q.questionId === a.questionId)).length < 10) throw badRequest("Answer all 10 unit-test questions.");
      const score = Math.round(answers.filter((a) => a.isCorrect && links.some((q) => q.questionId === a.questionId)).length / 10 * 100);
      const old = await db.userUnitTestProgress.findUnique({ where: { userId_unitId: { userId, unitId: id } } });
      const isPassed = score >= 70;
      const progress = await db.userUnitTestProgress.upsert({ where: { userId_unitId: { userId, unitId: id } },
        create: { userId, unitId: id, passedAt: isPassed ? new Date() : null, bestScorePct: score, attempts: 1 },
        update: { passedAt: isPassed ? new Date() : old?.passedAt ?? null, bestScorePct: Math.max(old?.bestScorePct ?? 0, score), attempts: { increment: 1 } } });
      if (isPassed && !old?.passedAt) await db.$transaction((tx) => awardXp(tx, userId, "unit-test-passed:" + id, "unit-test"));
      res.json({ passed: isPassed, scorePct: score, passScorePct: 70, progress });
    } catch (e) { next(e); }
  });
  router.post("/admin/path/build", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const result = await db.$transaction(async (tx) => {
        const approved = await tx.question.findMany({ where: { reviewStatus: "APPROVED" }, orderBy: [{ subjectId: "asc" }, { topicId: "asc" }, { id: "asc" }],
          select: { id: true, subjectId: true, topicId: true, subject: { select: { name: true } }, topic: { select: { name: true } } } });
        const assigned = await tx.lessonQuestion.findMany({ select: { questionId: true } });
        const assignedIds = new Set(assigned.map((x) => x.questionId));
        const groups = new Map<string, typeof approved>();
        for (const q of approved) {
          if (assignedIds.has(q.id) || q.topicId === null || !q.topic) continue;
          const key = q.subjectId + ":" + q.topicId;
          const group = groups.get(key) ?? []; group.push(q); groups.set(key, group);
        }
        let madeUnits = 0, madeLessons = 0, assignedQuestions = 0;
        for (const group of groups.values()) {
          if (group.length < 10) continue;
          const first = group[0]!;
          let unit = await tx.pathUnit.findUnique({ where: { subjectId_topicId: { subjectId: first.subjectId, topicId: first.topicId! } }, include: { lessons: { orderBy: { position: "asc" } } } });
          if (!unit) {
            const count = await tx.pathUnit.count({ where: { subjectId: first.subjectId } });
            unit = await tx.pathUnit.create({ data: { subjectId: first.subjectId, topicId: first.topicId!, position: count + 1, title: first.topic!.name }, include: { lessons: true } });
            madeUnits++;
          }
          const count = Math.floor(group.length / 10);
          for (let i = 0; i < count; i++) {
            const position = unit.lessons.length + 1;
            const lesson = await tx.pathLesson.create({ data: { unitId: unit.id, position, title: "Lesson " + position } });
            await tx.lessonQuestion.createMany({ data: group.slice(i * 10, i * 10 + 10).map((q, j) => ({ lessonId: lesson.id, questionId: q.id, position: j + 1 })) });
            madeLessons++; assignedQuestions += 10;
          }
        }
        return { unitsCreated: madeUnits, lessonsCreated: madeLessons, questionsAssigned: assignedQuestions };
      }, { isolationLevel: "Serializable" });
      res.json({ ok: true, ...result });
    } catch (e) { next(e); }
  });
  return router;
}
