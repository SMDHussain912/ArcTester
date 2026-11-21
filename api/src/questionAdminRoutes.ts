import { Router } from "express";
import express from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, notFound } from "./errors.js";
import { requireAdmin, requireAuth } from "./auth.js";
import { importFromCsv, importFromJson } from "./importService.js";
import { QuestionInputSchema, encodeOptions, hashQuestion } from "./questions.js";

const ListSchema = z.object({
  q: z.string().trim().max(300).optional(),
  subject: z.string().trim().max(120).optional(),
  topic: z.string().trim().max(120).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  reviewStatus: z.enum(["DRAFT", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const UpdateSchema = QuestionInputSchema.partial().refine((value) => Object.keys(value).length > 0);
const BulkSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });
const ReviewStatusSchema = z.enum(["DRAFT", "APPROVED", "REJECTED"]);
const AP_ECET_SUBJECT_QUOTAS: Record<string, number> = { Mathematics: 50, Physics: 25, Chemistry: 25, "Digital Electronics": 6, "Software Engineering": 6, "Computer Organisation and Microprocessors": 8, "Data Structures through C": 10, "Computer Networks": 6, "Operating Systems": 10, DBMS: 8, "Java Programming": 10, "Web Technologies": 8, "Big-data & Cloud Computing": 6, "Android Programming": 6, "Internet Of Things(IoT)": 8, "Python Programming": 8 };
function hasReviewableSource(source: string): boolean { const normalized = source.trim().toUpperCase(); return normalized.length > 0 && normalized !== "NEEDS HUMAN REVIEW"; }
export function questionAdminRouter(db: PrismaClient): Router {
  const router = Router();
  router.use("/admin", requireAuth, requireAdmin(db));


  router.get("/admin/question-review/progress", async (_req, res, next) => {
    try {
      const [subjects, groups] = await Promise.all([
        db.subject.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        db.question.groupBy({ by: ["subjectId", "reviewStatus"], _count: { _all: true } }),
      ]);
      const subjectById = new Map(subjects.map((subject) => [subject.id, subject.name]));
      const counts = new Map<string, { drafted: number; approved: number; rejected: number }>();
      for (const group of groups) {
        const name = subjectById.get(group.subjectId);
        if (!name) continue;
        const row = counts.get(name) ?? { drafted: 0, approved: 0, rejected: 0 };
        if (group.reviewStatus === "DRAFT") row.drafted = group._count._all;
        if (group.reviewStatus === "APPROVED") row.approved = group._count._all;
        if (group.reviewStatus === "REJECTED") row.rejected = group._count._all;
        counts.set(name, row);
      }
      const names = [...new Set([...subjects.map((subject) => subject.name), ...Object.keys(AP_ECET_SUBJECT_QUOTAS)])].sort();
      const progress = names.map((name) => {
        const row = counts.get(name) ?? { drafted: 0, approved: 0, rejected: 0 };
        const paperQuota = AP_ECET_SUBJECT_QUOTAS[name] ?? 0;
        const requiredQuota = paperQuota * 3;
        return { subject: name, paperQuota, requiredQuota, ...row, remaining: Math.max(0, requiredQuota - row.drafted - row.approved) };
      });
      const totals = progress.reduce((total, row) => ({ drafted: total.drafted + row.drafted, approved: total.approved + row.approved, rejected: total.rejected + row.rejected, requiredQuota: total.requiredQuota + row.requiredQuota, remaining: total.remaining + row.remaining }), { drafted: 0, approved: 0, rejected: 0, requiredQuota: 0, remaining: 0 });
      res.json({ ok: true, subjects: progress, totals });
    } catch (error) { next(error); }
  });

  router.patch("/admin/questions/review/bulk", async (req, res, next) => {
    try {
      const input = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500), status: ReviewStatusSchema }).parse(req.body);
      if (new Set(input.ids).size !== input.ids.length) return next(badRequest("Question IDs must be unique."));
      const result = await db.$transaction(async (tx) => {
        const questions = await tx.question.findMany({ where: { id: { in: input.ids } }, select: { id: true, source: true } });
        if (questions.length !== input.ids.length) throw badRequest("One or more selected questions do not exist.");
        if (input.status === "APPROVED") {
          const missingSource = questions.filter((question) => !hasReviewableSource(question.source)).map((question) => question.id);
          if (missingSource.length) throw badRequest("Add a real source before approving every selected question. Missing source for: " + missingSource.join(", ") + ".");
        }
        return tx.question.updateMany({ where: { id: { in: input.ids } }, data: { reviewStatus: input.status } });
      });
      res.json({ ok: true, updated: result.count, reviewStatus: input.status });
    } catch (error) { next(error); }
  });

  router.patch("/admin/questions/:id/review", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return next(badRequest("Invalid question ID."));
      const input = z.object({ status: ReviewStatusSchema, source: z.string().trim().max(500).optional() }).parse(req.body);
      const existing = await db.question.findUnique({ where: { id }, select: { id: true, source: true } });
      if (!existing) return next(notFound("Question not found."));
      const source = input.source ?? existing.source;
      if (input.status === "APPROVED" && !hasReviewableSource(source)) return next(badRequest("Add a real source before approving this question. The review placeholder is not a source."));
      const question = await db.question.update({ where: { id }, data: { reviewStatus: input.status, ...(input.source === undefined ? {} : { source: input.source }) }, select: { id: true, source: true, reviewStatus: true } });
      res.json({ ok: true, question });
    } catch (error) { next(error); }
  });
  router.get("/admin/questions", async (req, res, next) => {
    try {
      const filter = ListSchema.parse(req.query);
      const where = {
        ...(filter.subject ? { subject: { name: filter.subject } } : {}),
        ...(filter.topic ? { topic: { name: filter.topic } } : {}),
        ...(filter.difficulty ? { difficulty: filter.difficulty } : {}),
        ...(filter.reviewStatus ? { reviewStatus: filter.reviewStatus } : {}),
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
          explanation: q.explanation, source: q.source, difficulty: q.difficulty, reviewStatus: q.reviewStatus, createdAt: q.createdAt })) });
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

  router.get("/admin/question-catalog", async (_req, res, next) => {
    try {
      const subjects = await db.subject.findMany({ orderBy: { name: "asc" }, include: {
        topics: { orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { questions: true } } } },
        _count: { select: { questions: true } },
      } });
      res.json({ ok: true, subjects: subjects.map(s => ({ id: s.id, name: s.name, count: s._count.questions, topics: s.topics })) });
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
        difficulty: merged.difficulty, reviewStatus: "DRAFT", questionHash: hashQuestion(merged.text),
      }, include: { subject: true, topic: true } });
      res.json({ ok: true, question: updated });
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

  router.post("/admin/questions/import", express.json({ limit: "50mb" }), async (req, res, next) => {
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
