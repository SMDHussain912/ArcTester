import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, notFound } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { importFromCsv, importFromJson } from "./importService.js";
import { QuestionInputSchema, hashQuestion, encodeOptions } from "./questions.js";
import { insertQuestion } from "./questionRepository.js";

const ListSchema = z.object({
  q: z.string().trim().max(300).optional(),
  subject: z.string().trim().max(120).optional(),
  topic: z.string().trim().max(120).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const UpdateSchema = QuestionInputSchema.partial().refine((value) => Object.keys(value).length > 0);
const BulkSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });
export function questionAdminRouter(db: PrismaClient): Router {
  const router = Router();
  router.use("/admin", requireAuth, requireAdmin(db));

  router.get("/admin/questions", async (req, res, next) => {
    try {
      const filter = ListSchema.parse(req.query);
      const where = {
        ...(filter.subject ? { subject: { name: filter.subject } } : {}),
        ...(filter.topic ? { topic: { name: filter.topic } } : {}),
        ...(filter.difficulty ? { difficulty: filter.difficulty } : {}),
        ...(filter.q ? { OR: [
          { text: { contains: filter.q } },
          { explanation: { contains: filter.q } },
          { source: { contains: filter.q } },
        ] } : {}),
      };
      const [total, questions] = await db.$transaction([
        db.question.count({ where }),
        db.question.findMany({
          where, orderBy: { createdAt: "desc" },
          skip: (filter.page - 1) * filter.limit, take: filter.limit,
          include: { subject: true, topic: true },
        }),
      ]);
      res.json({ ok: true, total, page: filter.page, limit: filter.limit, pages: Math.ceil(total / filter.limit),
        questions: questions.map((q) => ({ id: q.id, subject: q.subject.name, topic: q.topic?.name ?? "General",
          text: q.text, options: JSON.parse(q.options), correctIndex: q.correctIndex,
          explanation: q.explanation, source: q.source, difficulty: q.difficulty, createdAt: q.createdAt })) });
    } catch (error) { next(error); }
  });

  router.get("/admin/exam-results", async (_req, res, next) => {
    try {
      const submissions = await db.examSubmission.findMany({
        orderBy: { receivedAt: "desc" },
        take: 200,
        include: { assignment: { include: {
          student: { select: { id: true, email: true } },
          examVersion: { include: { exam: { select: { id: true, title: true } } } },
        } } },
      });
      res.json({ ok: true, results: submissions.map(s => ({
        id: s.id, status: s.status, score: s.score, maximumScore: s.maximumScore,
        submittedAt: s.submittedAt, receivedAt: s.receivedAt,
        student: s.assignment.student, exam: s.assignment.examVersion.exam,
        version: s.assignment.examVersion.version,
      })) });
    } catch (error) { next(error); }
  });

  router.get("/admin/exams/:id/preview", async (req, res, next) => {
    try {
      const exam = await db.exam.findUnique({
        where: { id: req.params.id },
        include: { versions: { orderBy: { version: "desc" }, take: 1,
          include: { questions: { orderBy: { position: "asc" } } } } },
      });
      if (!exam || !exam.versions[0]) return next(notFound("Exam not found."));
      const version = exam.versions[0];
      res.json({ ok: true, exam: { id: exam.id, title: exam.title, description: exam.description,
        status: exam.status, version: version.version, instructions: version.instructions,
        durationMinutes: version.durationMinutes, shuffleQuestions: version.shuffleQuestions,
        shuffleOptions: version.shuffleOptions, publishedAt: version.publishedAt,
        questions: version.questions.map(q => ({ id: q.id, position: q.position, subject: q.subject,
          topic: q.topic, text: q.text, options: JSON.parse(q.options), correctIndex: q.correctIndex,
          explanation: q.explanation, marks: q.marks, negativeMarks: q.negativeMarks })) } });
    } catch (error) { next(error); }
  });

  router.get("/admin/students", async (_req, res, next) => {
    try {
      const students = await db.user.findMany({
        where: { role: "STUDENT" },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, createdAt: true },
      });
      res.json({ ok: true, students });
    } catch (error) { next(error); }
  });

  router.get("/admin/question-catalog", async (_req, res, next) => {
    try {
      const subjects = await db.subject.findMany({ orderBy: { name: "asc" }, include: {
        topics: { orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { questions: true } } } },
        _count: { select: { questions: true } },
      } });
      res.json({ ok: true, subjects: subjects.map(s => ({ id: s.id, name: s.name, count: s._count.questions, topics: s.topics })) });
    } catch (error) { next(error); }
  });

  router.post("/admin/questions", async (req: AuthedRequest, res, next) => {
    try {
      const input = QuestionInputSchema.parse(req.body);
      const result = await insertQuestion(db, input);
      if (result === "duplicate") return next(badRequest("A question with the same text already exists in the bank."));
      const created = await db.question.findFirst({ where: { questionHash: hashQuestion(input.text), },
        include: { subject: true, topic: true } });
      res.status(201).json({ ok: true, question: created });
    } catch (error) { next(error); }
  });

  router.put("/admin/questions/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return next(badRequest("Invalid question ID."));
      const existing = await db.question.findUnique({ where: { id } });
      if (!existing) return next(notFound("Question not found."));
      const patch = UpdateSchema.parse(req.body);
      const merged = QuestionInputSchema.parse({
        subject: patch.subject ?? (await db.subject.findUniqueOrThrow({ where: { id: existing.subjectId } })).name,
        topic: patch.topic ?? (existing.topicId ? (await db.topic.findUnique({ where: { id: existing.topicId } }))?.name : "General"),
        text: patch.text ?? existing.text,
        options: patch.options ?? JSON.parse(existing.options),
        correctIndex: patch.correctIndex ?? existing.correctIndex,
        explanation: patch.explanation ?? existing.explanation,
        source: patch.source ?? existing.source,
        difficulty: patch.difficulty ?? existing.difficulty,
      });
      const subject = await db.subject.upsert({ where: { name: merged.subject }, create: { name: merged.subject }, update: {} });
      const topic = await db.topic.upsert({ where: { subjectId_name: { subjectId: subject.id, name: merged.topic } },
        create: { subjectId: subject.id, name: merged.topic }, update: {} });
      const updated = await db.question.update({ where: { id }, data: {
        subjectId: subject.id, topicId: topic.id, text: merged.text, options: encodeOptions(merged.options),
        correctIndex: merged.correctIndex, explanation: merged.explanation, source: merged.source,
        difficulty: merged.difficulty, questionHash: hashQuestion(merged.text),
      }, include: { subject: true, topic: true } });
      res.json({ ok: true, question: updated });
    } catch (error) { next(error); }
  });

  router.delete("/admin/questions/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return next(badRequest("Invalid question ID."));
      const [answers, snapshots, stats] = await Promise.all([
        db.attemptAnswer.count({ where: { questionId: id } }),
        db.examVersionQuestion.count({ where: { sourceQuestionId: id } }),
        db.stat.count({ where: { questionId: id } }),
      ]);
      if (answers || snapshots || stats) return next(badRequest("This question has student history or an exam snapshot. Keep it in the bank instead of deleting historical data."));
      await db.question.delete({ where: { id } });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  router.post("/admin/questions/bulk-delete", async (req, res, next) => {
    try {
      const { ids } = BulkSchema.parse(req.body);
      const [answers, snapshots, stats] = await Promise.all([
        db.attemptAnswer.findMany({ where: { questionId: { in: ids } }, select: { questionId: true }, distinct: ["questionId"] }),
        db.examVersionQuestion.findMany({ where: { sourceQuestionId: { in: ids } }, select: { sourceQuestionId: true }, distinct: ["sourceQuestionId"] }),
        db.stat.findMany({ where: { questionId: { in: ids } }, select: { questionId: true }, distinct: ["questionId"] }),
      ]);
      const blocked = new Set([...answers.map(x => x.questionId), ...stats.map(x => x.questionId), ...snapshots.map(x => x.sourceQuestionId).filter((x): x is number => x !== null)]);
      const safeIds = ids.filter(id => !blocked.has(id));
      const deleted = await db.question.deleteMany({ where: { id: { in: safeIds } } });
      res.json({ ok: true, deleted: deleted.count, blocked: [...blocked] });
    } catch (error) { next(error); }
  });

  router.post("/admin/questions/import/preview", async (req, res, next) => {
    try {
      const body = z.object({ format: z.enum(["csv", "json"]), content: z.string().min(1).max(8_000_000) }).parse(req.body);
      let report;
      if (body.format === "csv") report = await importFromCsv(db, body.content, { dryRun: true });
      else {
        let parsed: unknown;
        try { parsed = JSON.parse(body.content); } catch { return next(badRequest("The JSON file is not valid JSON.")); }
        report = await importFromJson(db, parsed, { dryRun: true });
      }
      res.json({ ok: true, report });
    } catch (error) { next(error); }
  });

  router.post("/admin/questions/import", async (req, res, next) => {
    try {
      const body = z.object({ format: z.enum(["csv", "json"]), content: z.string().min(1).max(8_000_000) }).parse(req.body);
      let payload: unknown;
      if (body.format === "csv") payload = (await importFromCsv(db, body.content));
      else {
        let parsed: unknown;
        try { parsed = JSON.parse(body.content); } catch { return next(badRequest("The JSON file is not valid JSON.")); }
        payload = await importFromJson(db, parsed);
      }
      res.json({ ok: true, report: payload });
    } catch (error) { next(error); }
  });

  return router;
}
