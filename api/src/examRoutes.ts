import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import {
  QUESTION_ANALYTICS_MINIMUM_ANSWERS,
  QUESTION_ANALYTICS_WEAK_ACCURACY,
} from "./analytics.js";
import { parseOptions } from "./questionRoutes.js";
import { computeSimilarityFlags } from "./similarity.js";

// A deadline-triggered client submit may arrive up to 10 seconds after the
// authoritative deadline because of request scheduling and network transit.
// Requests received later than this window are retained for invigilator review.
export const AUTO_SUBMIT_GRACE_MS = 10_000;

const CreateExamSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  instructions: z.string().trim().max(5000).default(""),
  durationMinutes: z.number().int().min(1).max(600),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(true),
  subjectRules: z.record(z.string(), z.object({
    marks: z.number().finite().min(0).max(100),
    negativeMarks: z.number().finite().min(0).max(100),
  })).default({}),
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
}).refine((input) => input.questions.some((question) => question.marks > 0), {
  message: "An exam must award more than zero total marks.",
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

export function stableOptionOrder(assignmentId: string, questionId: string, optionCount: number): number[] {
  const order = Array.from({ length: optionCount }, (_, index) => index);
  return order.sort((left, right) => {
    const leftKey = createHash("sha256").update(assignmentId + ":" + questionId + ":" + left).digest("hex");
    const rightKey = createHash("sha256").update(assignmentId + ":" + questionId + ":" + right).digest("hex");
    return leftKey.localeCompare(rightKey);
  });
}

/** Deterministic, seeded per-assignment question order. Stable across refreshes
 * for the same assignment because it derives every random draw from the
 * assignment id plus a monotonic counter. */
export function seededRandom(seed: string) {
  let counter = 0;
  return (): number => {
    counter += 1;
    const digest = createHash("sha256").update(`${seed}:${counter}`).digest("hex");
    return parseInt(digest.slice(0, 8), 16) / 0xffffffff;
  };
}

export function fisherYatesShuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function examRouter(db: PrismaClient): Router {
  const router = Router();

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
          marks: input.subjectRules[question.subject.name]?.marks ?? selection.marks,
          negativeMarks: input.subjectRules[question.subject.name]?.negativeMarks ?? selection.negativeMarks,
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
      if (!version) return res.json({ ok: true, report: { title: exam.title, version: null, assigned: 0, started: 0, active: 0, submitted: 0, reviewRequired: 0, averagePercentage: null, subjects: [], questions: [] } });
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
    let requestedStudentIds: number[] = [];
    let assignedVersionId: string | null = null;
    try {
      const input = AssignExamSchema.parse(req.body);
      requestedStudentIds = input.studentIds;
      const exam = await db.exam.findUnique({
        where: { id: req.params.id },
        include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1 } },
      });
      const version = exam?.versions[0];
      if (!exam || !version) return next(notFound("No published exam version is available to assign."));
      assignedVersionId = version.id;
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
          const assignment = await tx.examAssignment.create({
            data: {
              examVersionId: version.id,
              studentId,
              assignedById: req.user!.id,
              availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
              dueAt: input.dueAt ? new Date(input.dueAt) : null,
            },
            select: { id: true, studentId: true, assignedAt: true, dueAt: true },
          });
          await tx.studentNotification.create({
            data: {
              userId: studentId,
              kind: "EXAM_ASSIGNMENT",
              title: "New exam assigned",
              message: `${exam.title} has been assigned to you. Open your assigned exams for details.`,
              href: "/assignments",
              dedupeKey: `exam-assignment:${assignment.id}`,
            },
          });
          results.push(assignment);
        }
        return results;
      });
      res.status(201).json({ ok: true, created: assignments.length, assignments });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        // A concurrent request may have won the unique assignment race. Treat
        // it as an idempotent retry only when every requested assignment now exists.
        const existing = assignedVersionId && requestedStudentIds.length > 0
          ? await db.examAssignment.findMany({
              where: { examVersionId: assignedVersionId, studentId: { in: requestedStudentIds } },
              select: { id: true, studentId: true, assignedAt: true, dueAt: true },
            })
          : [];
        if (existing.length === requestedStudentIds.length && requestedStudentIds.length > 0) {
          return res.status(200).json({ ok: true, created: 0, assignments: existing, alreadyAssigned: true });
        }
        return next(conflict("One or more students already have an assignment for this exam version. Refresh the assignment list before retrying."));
      }
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

  router.get("/admin/students", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        search: z.string().trim().max(120).optional(),
      }).parse(req.query);
      const where = { role: "STUDENT", ...(query.search ? { email: { contains: query.search } } : {}) };
      const [students, total] = await Promise.all([
        db.user.findMany({
          where, orderBy: { email: "asc" },
          skip: (query.page - 1) * query.limit, take: query.limit,
          select: { id: true, email: true },
        }),
        db.user.count({ where }),
      ]);
      res.json({ ok: true, students, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) });
    } catch (error) { next(error); }
  });

  router.get("/admin/analytics/overview", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const [
        studentCount, examCount, assignmentCount, submissionCount, reviewRequiredCount,
        practiceAttemptCount, practiceRows, formalRows, examRows, recentSubmissions, averageRows,
      ] = await Promise.all([
        db.user.count({ where: { role: "STUDENT" } }),
        db.exam.count(),
        db.examAssignment.count(),
        db.examSubmission.count({ where: { assignment: { student: { role: "STUDENT" } } } }),
        db.examSubmission.count({ where: { status: "REVIEW_REQUIRED", assignment: { student: { role: "STUDENT" } } } }),
        db.attempt.count({ where: { finishedAt: { not: null }, user: { role: "STUDENT" } } }),
        db.$queryRaw<Array<{
          questionId: number; subject: string; topic: string | null; difficulty: string;
          correct: number; incorrect: number; unanswered: number; uniqueStudents: number;
        }>>`
          SELECT aa."questionId" AS "questionId",
            MAX(CASE WHEN aa."subjectSnapshot" <> '' THEN aa."subjectSnapshot" ELSE s.name END) AS subject,
            MAX(CASE WHEN aa."subjectSnapshot" <> '' THEN aa."topicSnapshot" ELSE t.name END) AS topic,
            MAX(CASE WHEN aa."difficultySnapshot" <> '' THEN aa."difficultySnapshot" ELSE q.difficulty END) AS difficulty,
            SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = TRUE THEN 1 ELSE 0 END) AS correct,
            SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = FALSE THEN 1 ELSE 0 END) AS incorrect,
            SUM(CASE WHEN aa.chosen IS NULL THEN 1 ELSE 0 END) AS unanswered,
            COUNT(DISTINCT CASE WHEN aa.chosen IS NOT NULL THEN a."userId" END) AS "uniqueStudents"
          FROM "AttemptAnswer" aa
          INNER JOIN "Attempt" a ON a.id = aa."attemptId"
          INNER JOIN "User" u ON u.id = a."userId"
          INNER JOIN "Question" q ON q.id = aa."questionId"
          INNER JOIN "Subject" s ON s.id = q."subjectId"
          LEFT JOIN "Topic" t ON t.id = q."topicId"
          WHERE a."finishedAt" IS NOT NULL AND u.role = 'STUDENT'
          GROUP BY aa."questionId"
        `,
        db.$queryRaw<Array<{
          subject: string; topic: string | null; correct: number; incorrect: number;
          unanswered: number; awardedMarks: number; maximumMarks: number;
        }>>`
          SELECT eq.subject AS subject, eq.topic AS topic,
            SUM(CASE WHEN ea."selectedIndex" IS NOT NULL AND ea."isCorrect" = TRUE THEN 1 ELSE 0 END) AS correct,
            SUM(CASE WHEN ea."selectedIndex" IS NOT NULL AND ea."isCorrect" = FALSE THEN 1 ELSE 0 END) AS incorrect,
            SUM(CASE WHEN ea."selectedIndex" IS NULL THEN 1 ELSE 0 END) AS unanswered,
            SUM(ea."awardedMarks") AS "awardedMarks", SUM(eq.marks) AS "maximumMarks"
          FROM "ExamSubmissionAnswer" ea
          INNER JOIN "ExamSubmission" es ON es.id = ea."submissionId"
          INNER JOIN "ExamAssignment" ass ON ass.id = es."assignmentId"
          INNER JOIN "User" u ON u.id = ass."studentId"
          INNER JOIN "ExamVersionQuestion" eq ON eq.id = ea."examQuestionId"
          WHERE es.status = 'GRADED' AND u.role = 'STUDENT'
          GROUP BY eq.subject, eq.topic
        `,
        db.$queryRaw<Array<{
          examId: string; title: string; assigned: number; submitted: number; averagePercentage: number | null;
        }>>`
          SELECT ev."examId" AS "examId", e.title AS title,
            COUNT(ass.id) AS assigned,
            SUM(CASE WHEN sub.id IS NOT NULL THEN 1 ELSE 0 END) AS submitted,
            AVG(CASE WHEN sub.status = 'GRADED' AND sub.score IS NOT NULL AND sub."maximumScore" > 0
              THEN (sub.score * 100.0) / sub."maximumScore" ELSE NULL END) AS "averagePercentage"
          FROM "ExamAssignment" ass
          INNER JOIN "ExamVersion" ev ON ev.id = ass."examVersionId"
          INNER JOIN "Exam" e ON e.id = ev."examId"
          LEFT JOIN "ExamSubmission" sub ON sub."assignmentId" = ass.id
          GROUP BY ev."examId", e.title
          ORDER BY assigned DESC
        `,
        db.examSubmission.findMany({
          where: { assignment: { student: { role: "STUDENT" } } },
          orderBy: { submittedAt: "desc" }, take: 10,
          select: {
            id: true, submittedAt: true, score: true, maximumScore: true, status: true,
            assignment: {
              select: {
                studentId: true, student: { select: { email: true } },
                examVersion: { select: { exam: { select: { title: true } } } },
              },
            },
          },
        }),
        db.$queryRaw<Array<{ averagePercentage: number | null }>>`
          SELECT AVG((sub.score * 100.0) / sub."maximumScore") AS "averagePercentage"
          FROM "ExamSubmission" sub
          INNER JOIN "ExamAssignment" ass ON ass.id = sub."assignmentId"
          INNER JOIN "User" u ON u.id = ass."studentId"
          WHERE u.role = 'STUDENT' AND sub.status = 'GRADED'
            AND sub.score IS NOT NULL AND sub."maximumScore" > 0
        `,
      ]);

      const practiceBySubject = new Map<string, { correct: number; incorrect: number; unanswered: number }>();
      const practiceByTopic = new Map<string, { subject: string; topic: string | null; correct: number; incorrect: number; unanswered: number }>();
      const questionPerformance = practiceRows.map((row) => {
        const subject = row.subject, topic = row.topic;
        const correct = Number(row.correct ?? 0), incorrect = Number(row.incorrect ?? 0), unanswered = Number(row.unanswered ?? 0);
        const subjectRow = practiceBySubject.get(subject) ?? { correct: 0, incorrect: 0, unanswered: 0 };
        subjectRow.correct += correct; subjectRow.incorrect += incorrect; subjectRow.unanswered += unanswered;
        practiceBySubject.set(subject, subjectRow);
        const key = JSON.stringify([subject, topic]);
        const topicRow = practiceByTopic.get(key) ?? { subject, topic, correct: 0, incorrect: 0, unanswered: 0 };
        topicRow.correct += correct; topicRow.incorrect += incorrect; topicRow.unanswered += unanswered;
        practiceByTopic.set(key, topicRow);
        const sampleSize = correct + incorrect;
        const uniqueStudents = Number(row.uniqueStudents ?? 0);
        const accuracy = sampleSize > 0 ? correct / sampleSize : null;
        const sufficientData = sampleSize >= QUESTION_ANALYTICS_MINIMUM_ANSWERS && uniqueStudents >= 3;
        return {
          questionId: row.questionId, subject, topic, difficulty: row.difficulty,
          correct, incorrect, unanswered, sampleSize, uniqueStudents, accuracy,
          sufficientData, weak: sufficientData && accuracy !== null && accuracy < QUESTION_ANALYTICS_WEAK_ACCURACY,
        };
      }).sort((a, b) => Number(b.weak) - Number(a.weak) || (a.accuracy ?? 1) - (b.accuracy ?? 1) || b.sampleSize - a.sampleSize);
      const practiceCorrect = questionPerformance.reduce((sum, row) => sum + row.correct, 0);
      const practiceIncorrect = questionPerformance.reduce((sum, row) => sum + row.incorrect, 0);
      const practiceUnanswered = questionPerformance.reduce((sum, row) => sum + row.unanswered, 0);
      const practiceAnswered = practiceCorrect + practiceIncorrect;

      const formalBySubject = new Map<string, { correct: number; incorrect: number; unanswered: number; awardedMarks: number; maximumMarks: number }>();
      const formalByTopic = new Map<string, { subject: string; topic: string | null; correct: number; incorrect: number; unanswered: number; awardedMarks: number; maximumMarks: number }>();
      let formalCorrect = 0, formalIncorrect = 0, formalUnanswered = 0;
      for (const row of formalRows) {
        const correct = Number(row.correct ?? 0), incorrect = Number(row.incorrect ?? 0), unanswered = Number(row.unanswered ?? 0);
        const awardedMarks = Number(row.awardedMarks ?? 0), maximumMarks = Number(row.maximumMarks ?? 0);
        formalCorrect += correct; formalIncorrect += incorrect; formalUnanswered += unanswered;
        const subjectRow = formalBySubject.get(row.subject) ?? { correct: 0, incorrect: 0, unanswered: 0, awardedMarks: 0, maximumMarks: 0 };
        subjectRow.correct += correct; subjectRow.incorrect += incorrect; subjectRow.unanswered += unanswered;
        subjectRow.awardedMarks += awardedMarks; subjectRow.maximumMarks += maximumMarks;
        formalBySubject.set(row.subject, subjectRow);
        const key = JSON.stringify([row.subject, row.topic]);
        const topicRow = formalByTopic.get(key) ?? { subject: row.subject, topic: row.topic, correct: 0, incorrect: 0, unanswered: 0, awardedMarks: 0, maximumMarks: 0 };
        topicRow.correct += correct; topicRow.incorrect += incorrect; topicRow.unanswered += unanswered;
        topicRow.awardedMarks += awardedMarks; topicRow.maximumMarks += maximumMarks;
        formalByTopic.set(key, topicRow);
      }
      const exams = examRows.map((row) => {
        const assigned = Number(row.assigned ?? 0), submitted = Number(row.submitted ?? 0);
        return {
          examId: row.examId, title: row.title, assigned, submitted,
          submissionRate: assigned ? submitted / assigned : 0,
          averagePercentage: row.averagePercentage === null ? null : Number(row.averagePercentage),
        };
      });
      const averagePercentage = averageRows[0]?.averagePercentage == null ? null : Number(averageRows[0].averagePercentage);
      const recent = recentSubmissions.map((item) => ({
        submissionId: item.id, studentId: item.assignment.studentId,
        studentEmail: item.assignment.student.email,
        examTitle: item.assignment.examVersion.exam.title,
        submittedAt: item.submittedAt, score: item.score,
        maximumScore: item.maximumScore, status: item.status,
      }));
      const gradedCount = await db.examSubmission.count({ where: { status: "GRADED", assignment: { student: { role: "STUDENT" } } } });
      res.json({
        ok: true,
        totals: {
          students: studentCount, exams: examCount, assignments: assignmentCount,
          submissions: submissionCount, reviewRequired: reviewRequiredCount,
          submissionRate: assignmentCount ? submissionCount / assignmentCount : 0,
          averagePercentage,
        },
        practice: {
          completedAttempts: practiceAttemptCount,
          questions: practiceCorrect + practiceIncorrect + practiceUnanswered,
          correct: practiceCorrect, incorrect: practiceIncorrect, unanswered: practiceUnanswered,
          accuracy: practiceAnswered > 0 ? practiceCorrect / practiceAnswered : null,
          subjects: [...practiceBySubject.entries()].map(([subject, row]) => ({
            subject, ...row, accuracy: row.correct + row.incorrect > 0 ? row.correct / (row.correct + row.incorrect) : null,
          })),
          topics: [...practiceByTopic.values()].map((row) => ({
            ...row, accuracy: row.correct + row.incorrect > 0 ? row.correct / (row.correct + row.incorrect) : null,
          })),
          questionPerformance: {
            minimumAnswers: QUESTION_ANALYTICS_MINIMUM_ANSWERS, minimumStudents: 3,
            weakAccuracyThreshold: QUESTION_ANALYTICS_WEAK_ACCURACY,
            insufficientSampleCount: questionPerformance.filter((row) => !row.sufficientData).length,
            questions: questionPerformance,
          },
        },
        formalExams: {
          graded: gradedCount, reviewRequired: reviewRequiredCount,
          correct: formalCorrect, incorrect: formalIncorrect, unanswered: formalUnanswered,
          subjects: [...formalBySubject.entries()].map(([subject, row]) => ({
            subject, ...row, accuracy: row.correct + row.incorrect > 0 ? row.correct / (row.correct + row.incorrect) : null,
          })),
          topics: [...formalByTopic.values()].map((row) => ({
            ...row, accuracy: row.correct + row.incorrect > 0 ? row.correct / (row.correct + row.incorrect) : null,
          })),
        },
        exams, recentSubmissions: recent,
      });
    } catch (error) { next(error); }
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
      let orderedQuestions = [...assignment.examVersion.questions];
      if (assignment.examVersion.shuffleQuestions) {
        orderedQuestions = fisherYatesShuffle(orderedQuestions, seededRandom(assignment.id));
      }
      const packageBody = {
        assignmentId: assignment.id,
        examId: assignment.examVersion.exam.id,
        title: assignment.examVersion.exam.title,
        description: assignment.examVersion.exam.description,
        version: assignment.examVersion.version,
        instructions: assignment.examVersion.instructions,
        durationMinutes: assignment.examVersion.durationMinutes,
        integrityLevel: assignment.examVersion.integrityLevel,
        availableFrom: assignment.availableFrom,
        dueAt: assignment.dueAt,
        serverTime: new Date(now).toISOString(),
        questions: orderedQuestions.map((question) => {
          const originalOptions = parseOptions(question.options);
          const optionOrder = assignment.examVersion.shuffleOptions
            ? stableOptionOrder(assignment.id, question.id, originalOptions.length)
            : originalOptions.map((_, index) => index);
          return {
            id: question.id,
            position: question.position,
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

  // Get integrity flags for an assignment (admin only)
  router.get("/exams/assignments/:id/integrity-flags", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const flags = await computeSimilarityFlags(db, req.params.id);
      res.json({ ok: true, flags });
    } catch (error) {
      next(error);
    }
  });

  // Dismiss an integrity flag (admin only)
  router.post("/exams/assignments/:id/integrity-flags/:flagId/dismiss", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const flag = await db.integrityFlag.findUnique({
        where: { id: req.params.flagId },
      });
      if (!flag) return next(notFound("Integrity flag not found"));
      if (flag.assignmentId !== req.params.id) return next(notFound("Flag not found for this assignment"));

      await db.integrityFlag.update({
        where: { id: req.params.flagId },
        data: {
          dismissed: true,
          dismissedAt: new Date(),
          dismissedBy: (req as AuthedRequest).user!.id,
        },
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
