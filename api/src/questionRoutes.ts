import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, conflict, notFound } from "./errors.js";
import { hashQuestion, QuestionInputSchema } from "./questions.js";
import { insertQuestion } from "./questionRepository.js";
import { requireAdmin, requireAuth } from "./auth.js";
import { importFromCsv, importFromJson } from "./importService.js";

export function parseOptions(raw: string): string[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("A question in the bank has invalid options.");
  }
  return value;
}

export function questionRouter(db: PrismaClient): Router {
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
      const databaseError = error instanceof Error ? error.message : "";
      const errorCode = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if (errorCode === "P2003" || /violates RESTRICT setting of foreign key constraint|SQLSTATE 23001|code: "23001"/i.test(databaseError)) {
        return next(conflict("This question is already used in practice history or student progress and cannot be deleted."));
      }
      next(error);
    }
  });

  return router;
}
