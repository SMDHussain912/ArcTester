import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { parseOptions } from "./questionRoutes.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";

// A deadline-triggered client submit may arrive up to 10 seconds after the
// authoritative deadline because of request scheduling and network transit.
// Requests received later than this window are retained for invigilator review.
const AUTO_SUBMIT_GRACE_MS = 10_000;

export function sessionRouter(db: PrismaClient): Router {
  const router = Router();

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
      if (assignment.session?.startedAt && now.getTime() >= assignment.session.startedAt.getTime() + assignment.examVersion.durationMinutes * 60000 + assignment.session.pausedDurationMs + 60000) {
        await db.$transaction(async (tx) => {
          const changed = await tx.examSession.updateMany({
            where: { id: assignment.session!.id, status: assignment.session!.status },
            data: { status: "EXPIRED", endedAt: now },
          });
          if (changed.count === 1) {
            await tx.examSessionEvent.create({
              data: { sessionId: assignment.session!.id, actorId: req.user!.id, type: "SESSION_EXPIRED", detail: "Server-side examination duration elapsed before the candidate reconnected." },
            });
          }
        });
        return next(conflict("The exam duration has expired. Contact the invigilator."));
      }
      const session = assignment.session
        ? await db.$transaction(async (tx) => {
            const changed = await tx.examSession.updateMany({
              where: {
                id: assignment.session!.id,
                status: assignment.session!.status,
                startedAt: { not: null },
              },
              data: { status: "ACTIVE", lastHeartbeatAt: now, lastActivityAt: now },
            });
            if (changed.count !== 1) {
              throw conflict("The exam session changed while reconnecting. Refresh and try again.");
            }
            const updated = await tx.examSession.findUniqueOrThrow({
              where: { id: assignment.session!.id },
            });
            await tx.examSessionEvent.create({
              data: { sessionId: updated.id, actorId: req.user!.id, type: "SESSION_RESUMED", detail: "Candidate restored an existing active session." },
            });
            return updated;
          })
        : await db.examSession.create({
            data: {
              assignmentId: assignment.id, studentId: req.user!.id, status: "ACTIVE",
              startedAt: now, lastHeartbeatAt: now, lastActivityAt: now,
              events: { create: { actorId: req.user!.id, type: "SESSION_STARTED", detail: "Candidate started the assigned examination." } },
            },
          }).catch(async (error: unknown) => {
            const errorCode = typeof error === "object" && error !== null && "code" in error
              ? (error as { code?: string }).code
              : undefined;
            if (errorCode !== "P2002") throw error;

            // Two devices can request the first session at the same time. The
            // unique assignment constraint elects one creator; the other
            // request should attach to that active session, not return HTTP 500.
            const concurrentSession = await db.examSession.findUnique({
              where: { assignmentId: assignment.id },
            });
            if (!concurrentSession || concurrentSession.status !== "ACTIVE" || !concurrentSession.startedAt) {
              throw conflict("The exam session changed while starting. Refresh and try again.");
            }
            return concurrentSession;
          });
      const deadline = session.startedAt ? new Date(session.startedAt.getTime() + assignment.examVersion.durationMinutes * 60000 + session.pausedDurationMs) : null;
      res.json({ ok: true, session: { id: session.id, status: session.status, startedAt: session.startedAt, lastHeartbeatAt: session.lastHeartbeatAt, serverTime: now, deadline } });
    } catch (error) { next(error); }
  });

  router.get("/exams/assignments/:id/answers", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const assignment = await db.examAssignment.findFirst({
        where: { id: req.params.id, studentId: req.user!.id },
        include: { session: { include: { answers: { orderBy: { updatedAt: "asc" } } } } },
      });
      if (!assignment) return next(notFound("Exam assignment not found."));
      res.json({
        ok: true,
        revision: assignment.session?.answersRevision ?? 0,
        answers: assignment.session?.answers.map((answer) => ({
          examQuestionId: answer.examQuestionId,
          selectedIndex: answer.selectedIndex,
          updatedAt: answer.updatedAt,
        })) ?? [],
      });
    } catch (error) { next(error); }
  });

  const SaveExamAnswersSchema = z.object({
    revision: z.number().int().nonnegative().optional(),
    answers: z.array(z.object({
      examQuestionId: z.string().min(1).max(64),
      selectedIndex: z.number().int().min(0).max(3).nullable(),
    })).min(1).max(500),
  }).refine((input) => new Set(input.answers.map((answer) => answer.examQuestionId)).size === input.answers.length, {
    message: "Each exam question may appear only once in an answer save.",
    path: ["answers"],
  });

  router.put("/exams/assignments/:id/answers", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = SaveExamAnswersSchema.parse(req.body);
      const assignment = await db.examAssignment.findFirst({
        where: { id: req.params.id, studentId: req.user!.id },
        include: {
          session: true,
          submission: { select: { id: true } },
          examVersion: { include: { questions: { select: { id: true, options: true } } } },
        },
      });
      if (!assignment) return next(notFound("Exam assignment not found."));
      if (assignment.submission) return next(conflict("This exam has already been submitted."));
      if (!assignment.session || assignment.session.status !== "ACTIVE" || !assignment.session.startedAt) {
        return next(conflict("There is no active exam session to save answers."));
      }
      const now = new Date();
      const deadline = new Date(
        assignment.session.startedAt.getTime() +
        assignment.examVersion.durationMinutes * 60_000 +
        assignment.session.pausedDurationMs
      );
      if (now >= deadline || (assignment.dueAt && now >= assignment.dueAt)) {
        return next(forbidden("The examination time has expired."));
      }
      const questionById = new Map(assignment.examVersion.questions.map((question) => [question.id, question]));
      for (const answer of input.answers) {
        const question = questionById.get(answer.examQuestionId);
        if (!question) return next(badRequest("An answer is for a question not in this exam."));
        const optionCount = parseOptions(question.options).length;
        if (answer.selectedIndex !== null && answer.selectedIndex >= optionCount) {
          return next(badRequest("The selected option does not exist for this question."));
        }
      }
      const revision = await db.$transaction(async (tx) => {
        const bumped = await tx.examSession.updateMany({
          where: {
            id: assignment.session!.id,
            status: "ACTIVE",
            startedAt: { not: null },
            ...(input.revision === undefined ? {} : { answersRevision: input.revision }),
          },
          data: { answersRevision: { increment: 1 }, lastActivityAt: now },
        });
        if (bumped.count !== 1) {
          throw conflict("These answers were changed in another session. Reload the exam before continuing.");
        }
        for (const answer of input.answers) {
          await tx.examSessionAnswer.upsert({
            where: {
              sessionId_examQuestionId: {
                sessionId: assignment.session!.id,
                examQuestionId: answer.examQuestionId,
              },
            },
            create: {
              sessionId: assignment.session!.id,
              examQuestionId: answer.examQuestionId,
              selectedIndex: answer.selectedIndex,
            },
            update: { selectedIndex: answer.selectedIndex },
          });
        }
        const updated = await tx.examSession.findUniqueOrThrow({
          where: { id: assignment.session!.id },
          select: { answersRevision: true },
        });
        return updated.answersRevision;
      });
      res.json({ ok: true, savedAt: now, savedCount: input.answers.length, revision });
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
      if (deadline && now.getTime() >= deadline.getTime() + 60000) {
        await db.$transaction(async (tx) => {
          const changed = await tx.examSession.updateMany({
            where: { id: assignment.session!.id, status: "ACTIVE" },
            data: { status: "EXPIRED", endedAt: now },
          });
          if (changed.count === 1) {
            await tx.examSessionEvent.create({
              data: { sessionId: assignment.session!.id, actorId: req.user!.id, type: "SESSION_EXPIRED", detail: "Server-side examination deadline elapsed." },
            });
          }
        });
        // 403 (not 409) so the candidate client can keep its local timer running
        // and still submit saved answers for invigilator review.
        return next(forbidden("The examination time has expired."));
      }
      if (assignment.dueAt && assignment.dueAt <= now) return next(forbidden("The examination submission deadline has passed."));
      const stale = assignment.session.lastHeartbeatAt && now.getTime() - assignment.session.lastHeartbeatAt.getTime() > 90000;
      const session = await db.$transaction(async (tx) => {
        const changed = await tx.examSession.updateMany({
          where: {
            id: assignment.session!.id,
            status: "ACTIVE",
            startedAt: assignment.session!.startedAt,
          },
          data: {
            lastHeartbeatAt: now, lastActivityAt: now, heartbeatCount: { increment: 1 },
            ...(input.event === "FOCUS_LOST" ? { focusLossCount: { increment: 1 } } : {}),
            ...(stale ? { disconnectCount: { increment: 1 } } : {}),
          },
        });
        if (changed.count !== 1) throw conflict("The exam session is no longer active.");
        const updated = await tx.examSession.findUniqueOrThrow({ where: { id: assignment.session!.id } });
        if (input.event !== "HEARTBEAT" || stale) {
          await tx.examSessionEvent.create({
            data: { sessionId: updated.id, actorId: req.user!.id, type: stale ? "CONNECTION_RESTORED" : input.event, detail: stale ? "Heartbeat resumed after a connection gap." : "Candidate browser activity signal." },
          });
        }
        return updated;
      });
      const effectiveDeadline = session.startedAt ? new Date(session.startedAt.getTime() + assignment.examVersion.durationMinutes * 60000 + session.pausedDurationMs) : null;
      res.json({ ok: true, serverTime: now, deadline: effectiveDeadline, sessionStatus: session.status });
    } catch (error) { next(error); }
  });

  router.get("/admin/exams/assignments/:id/audit", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const assignment = await db.examAssignment.findUnique({
        where: { id: req.params.id },
        include: {
          student: { select: { id: true, email: true } },
          examVersion: { include: { exam: { select: { title: true } } } },
          session: {
            include: {
              events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { id: true, email: true, role: true } } } },
            },
          },
          submission: { select: { id: true, status: true, submittedAt: true, receivedAt: true, score: true, maximumScore: true } },
        },
      });
      if (!assignment) return next(notFound("Exam assignment not found."));
      res.json({ ok: true, audit: {
        assignmentId: assignment.id, candidate: assignment.student,
        exam: assignment.examVersion.exam, version: assignment.examVersion.version,
        session: assignment.session ? {
          id: assignment.session.id, status: assignment.session.status,
          startedAt: assignment.session.startedAt, lastHeartbeatAt: assignment.session.lastHeartbeatAt,
          endedAt: assignment.session.endedAt, heartbeatCount: assignment.session.heartbeatCount,
          focusLossCount: assignment.session.focusLossCount, disconnectCount: assignment.session.disconnectCount,
        } : null,
        submission: assignment.submission,
        events: assignment.session?.events ?? [],
      } });
    } catch (error) { next(error); }
  });

  router.post("/admin/exams/sessions/:id/action", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ action: z.enum(["PAUSE", "RESUME", "TERMINATE"]), reason: z.string().trim().min(1, "An audit reason is required.").max(300) }).parse(req.body);
      const session = await db.examSession.findUnique({ where: { id: req.params.id } });
      if (!session) return next(notFound("Exam session not found."));
      if (["COMPLETED", "TERMINATED", "EXPIRED"].includes(session.status)) return next(conflict("This exam session is already closed."));
      const now = new Date();
      const status = input.action === "PAUSE" ? "PAUSED" : input.action === "RESUME" ? "ACTIVE" : "TERMINATED";
      const updated = await db.$transaction(async (tx) => {
        const current = await tx.examSession.findUnique({ where: { id: session.id } });
        if (!current) throw notFound("Exam session not found.");
        if (["COMPLETED", "TERMINATED", "EXPIRED"].includes(current.status)) {
          throw conflict("This exam session is already closed.");
        }
        if (input.action === "PAUSE" && current.status === "PAUSED") {
          // Repeated pause is idempotent and must not reset pausedAt or add
          // duplicate audit events.
          return { id: current.id, status: current.status, endedAt: current.endedAt };
        }
        if (input.action === "PAUSE" && current.status !== "ACTIVE") {
          throw conflict("Only an active exam session can be paused.");
        }
        if (input.action === "RESUME" && current.status !== "PAUSED") {
          throw conflict("This exam session is not paused.");
        }
        const changed = await tx.examSession.updateMany({
          where: { id: current.id, status: current.status },
          data: {
            status, lastActivityAt: now,
            ...(input.action === "PAUSE" ? { pausedAt: now } : {}),
            ...(input.action === "RESUME" && current.pausedAt ? { pausedDurationMs: { increment: now.getTime() - current.pausedAt.getTime() }, pausedAt: null } : {}),
            ...(input.action === "TERMINATE" ? {
              endedAt: now,
              pausedAt: null,
              ...(current.pausedAt ? { pausedDurationMs: { increment: Math.max(0, now.getTime() - current.pausedAt.getTime()) } } : {}),
            } : {}),
          },
        });
        if (changed.count !== 1) throw conflict("The exam session changed concurrently. Refresh and try again.");
        await tx.examSessionEvent.create({
          data: { sessionId: current.id, actorId: req.user!.id, type: "INVIGILATOR_" + input.action, detail: input.reason || "Action taken by invigilator." },
        });
        return tx.examSession.findUniqueOrThrow({
          where: { id: current.id },
          select: { id: true, status: true, endedAt: true },
        });
      });
      res.json({ ok: true, session: { id: updated.id, status: updated.status, endedAt: updated.endedAt } });
    } catch (error) { next(error); }
  });

  router.get("/admin/exams/live-sessions", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), eventLimit: z.coerce.number().int().min(1).max(100).default(12) }).parse(req.query);
      const where = { status: { in: ["ACTIVE", "PAUSED", "INTERRUPTED"] } };
      const [sessions, total] = await Promise.all([
        db.examSession.findMany({
          where, orderBy: { lastHeartbeatAt: "desc" },
          skip: (query.page - 1) * query.limit, take: query.limit,
          include: {
            student: { select: { id: true, email: true } },
            assignment: { include: { examVersion: { include: { exam: { select: { id: true, title: true } } } }, submission: { select: { id: true, status: true } } } },
            events: { orderBy: { createdAt: "desc" }, take: query.eventLimit, include: { actor: { select: { email: true, role: true } } } },
          },
        }),
        db.examSession.count({ where }),
      ]);
      const now = Date.now();
      res.json({
        ok: true, serverTime: new Date(now),
        sessions: sessions.map((session) => ({
          id: session.id, status: session.status, student: session.student,
          exam: session.assignment.examVersion.exam, assignmentId: session.assignmentId,
          startedAt: session.startedAt, lastHeartbeatAt: session.lastHeartbeatAt,
          connectivity: session.status === "ACTIVE" && session.lastHeartbeatAt && now - session.lastHeartbeatAt.getTime() <= 90000 ? "CONNECTED" : "STALE",
          heartbeatCount: session.heartbeatCount, focusLossCount: session.focusLossCount,
          disconnectCount: session.disconnectCount, submission: session.assignment.submission, events: session.events,
        })),
        page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit),
      });
    } catch (error) { next(error); }
  });

  router.get("/admin/exams/attendance", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(req.query);
      const [assignments, total] = await Promise.all([
        db.examAssignment.findMany({
          orderBy: { assignedAt: "desc" },
          skip: (query.page - 1) * query.limit, take: query.limit,
          include: {
            student: { select: { id: true, email: true } },
            examVersion: { include: { exam: { select: { id: true, title: true } }, _count: { select: { questions: true } } } },
            session: { select: { id: true, status: true, startedAt: true, lastHeartbeatAt: true, endedAt: true, heartbeatCount: true, focusLossCount: true, disconnectCount: true } },
            submission: { select: { id: true, status: true, submittedAt: true, score: true, maximumScore: true } },
          },
        }),
        db.examAssignment.count(),
      ]);
      const now = Date.now();
      res.json({
        ok: true, serverTime: new Date(now),
        attendance: assignments.map((item) => ({
          assignmentId: item.id, candidate: item.student, exam: item.examVersion.exam,
          version: item.examVersion.version, questionCount: item.examVersion._count.questions,
          assignedAt: item.assignedAt, availableFrom: item.availableFrom, dueAt: item.dueAt,
          attendanceStatus: item.submission ? "SUBMITTED" : item.session?.startedAt ? item.session.status : "NOT_STARTED",
          connectivity: item.session?.status === "ACTIVE" && item.session.lastHeartbeatAt && now - item.session.lastHeartbeatAt.getTime() <= 90000 ? "CONNECTED" : item.session?.startedAt ? "STALE_OR_INACTIVE" : "NOT_STARTED",
          session: item.session, submission: item.submission,
        })),
        page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit),
      });
    } catch (error) { next(error); }
  });

  return router;
}
