import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { parseOptions } from "./questionRoutes.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { getLearningConceptsForTopic } from "./intelligence/conceptKnowledge.js";
import {
  AUTO_SUBMIT_GRACE_MS,
  stableOptionOrder,
} from "./examRoutes.js";

export function submissionRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/admin/submissions/review-required", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      }).parse(req.query);
      const where = { status: "REVIEW_REQUIRED", assignment: { student: { role: "STUDENT" } } };
      const [items, total] = await Promise.all([
        db.examSubmission.findMany({
          where, orderBy: { receivedAt: "desc" },
          skip: (query.page - 1) * query.limit, take: query.limit,
          select: {
            id: true, submittedAt: true, receivedAt: true, score: true, maximumScore: true,
            assignment: {
              select: {
                id: true, studentId: true, student: { select: { email: true } },
                examVersion: { select: { exam: { select: { title: true } } } },
              },
            },
          },
        }),
        db.examSubmission.count({ where }),
      ]);
      res.json({
        ok: true,
        submissions: items.map((item) => ({
          submissionId: item.id, assignmentId: item.assignment.id, studentId: item.assignment.studentId,
          studentEmail: item.assignment.student.email, examTitle: item.assignment.examVersion.exam.title,
          submittedAt: item.submittedAt, receivedAt: item.receivedAt,
          score: item.score, maximumScore: item.maximumScore,
        })),
        page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit),
      });
    } catch (error) { next(error); }
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
      const answers = new Map(submission.answers.map((answer) => [answer.examQuestionId, answer]));
      res.json({
        ok: true,
        submission: {
          id: submission.id, status: submission.status, score: submission.score,
          maximumScore: submission.maximumScore, startedAt: submission.startedAt,
          submittedAt: submission.submittedAt, receivedAt: submission.receivedAt,
          student: submission.assignment.student,
          exam: {
            ...submission.assignment.examVersion.exam,
            version: submission.assignment.examVersion.version,
            durationMinutes: submission.assignment.examVersion.durationMinutes,
          },
          availableFrom: submission.assignment.availableFrom, dueAt: submission.assignment.dueAt,
          questions: submission.assignment.examVersion.questions.map((question) => {
            const answer = answers.get(question.id);
            return {
              id: question.id, position: question.position, subject: question.subject,
              topic: question.topic, text: question.text, options: parseOptions(question.options),
              correctIndex: question.correctIndex, explanation: question.explanation,
              marks: question.marks, negativeMarks: question.negativeMarks,
              selectedIndex: answer?.selectedIndex ?? null, isCorrect: answer?.isCorrect ?? false,
              awardedMarks: answer?.awardedMarks ?? 0,
            };
          }),
        },
      });
    } catch (error) { next(error); }
  });

  router.post("/admin/submissions/:id/release", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const submission = await db.examSubmission.findUnique({
        where: { id: req.params.id },
        include: {
          assignment: {
            select: {
              studentId: true,
              id: true,
              examVersion: { select: { exam: { select: { title: true } } } },
            },
          },
        },
      });
      if (!submission) return next(notFound("Submission not found."));
      if (submission.status === "GRADED") {
        return res.json({ ok: true, submissionId: submission.id, status: "GRADED", alreadyReleased: true });
      }
      const released = await db.$transaction(async (tx) => {
        const changed = await tx.examSubmission.updateMany({
          where: { id: submission.id, status: "REVIEW_REQUIRED" },
          data: { status: "GRADED" },
        });
        if (changed.count !== 1) {
          const current = await tx.examSubmission.findUnique({
            where: { id: submission.id },
            select: { status: true },
          });
          return current?.status === "GRADED" ? "already-released" as const : "conflict" as const;
        }
        await tx.studentNotification.updateMany({
          where: {
            userId: submission.assignment.studentId,
            dedupeKey: `exam-submission:${submission.id}`,
            kind: "EXAM_REVIEW",
            readAt: null,
          },
          data: { readAt: new Date() },
        });
        await tx.studentNotification.create({
          data: {
            userId: submission.assignment.studentId,
            kind: "EXAM_RESULT",
            title: "Exam result available",
            message: `Your submission for ${submission.assignment.examVersion.exam.title} has been reviewed and graded. Open the result to see your score.`,
            href: `/assignments/${submission.assignment.id}/result`,
            dedupeKey: `exam-review-release:${submission.id}`,
          },
        });
        return "released" as const;
      });
      if (released === "conflict") return next(conflict("This submission is no longer awaiting review."));
      res.json({
        ok: true,
        submissionId: submission.id,
        status: "GRADED",
        ...(released === "already-released" ? { alreadyReleased: true } : {}),
      });
    } catch (error) {
      next(error);
    }
  });

  const ReleaseBulkSchema = z.object({
    submissionIds: z.array(z.string().min(1)).min(1).max(100),
  });

  /** Release many held REVIEW_REQUIRED submissions in one audited, transactional action. */
  router.post("/admin/submissions/release-bulk", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const { submissionIds } = ReleaseBulkSchema.parse(req.body);
      const now = new Date();
      const results: Array<{
        submissionId: string;
        status: "released" | "already-released" | "not-found" | "not-awaiting-review";
      }> = [];
      for (const submissionId of submissionIds) {
        const submission = await db.examSubmission.findUnique({
          where: { id: submissionId },
          select: {
            id: true,
            status: true,
            assignment: {
              select: {
                id: true,
                studentId: true,
                examVersion: { select: { exam: { select: { title: true } } } },
              },
            },
          },
        });
        if (!submission) {
          results.push({ submissionId, status: "not-found" });
          continue;
        }
        if (submission.status !== "REVIEW_REQUIRED") {
          results.push({
            submissionId,
            status: submission.status === "GRADED" ? "already-released" : "not-awaiting-review",
          });
          continue;
        }
        await db.$transaction(async (tx) => {
          const changed = await tx.examSubmission.updateMany({
            where: { id: submissionId, status: "REVIEW_REQUIRED" },
            data: { status: "GRADED" },
          });
          if (changed.count !== 1) {
            const current = await tx.examSubmission.findUnique({
              where: { id: submissionId },
              select: { status: true },
            });
            results.push({
              submissionId,
              status: current?.status === "GRADED" ? "already-released" : "not-awaiting-review",
            });
            return;
          }
          await tx.studentNotification.updateMany({
            where: {
              userId: submission.assignment.studentId,
              dedupeKey: `exam-submission:${submissionId}`,
              kind: "EXAM_REVIEW",
              readAt: null,
            },
            data: { readAt: now },
          });
          await tx.studentNotification.create({
            data: {
              userId: submission.assignment.studentId,
              kind: "EXAM_RESULT",
              title: "Exam result available",
              message: `Your submission for ${submission.assignment.examVersion.exam.title} has been reviewed and graded. Open the result to see your score.`,
              href: `/assignments/${submission.assignment.id}/result`,
              dedupeKey: `exam-review-release:${submissionId}`,
            },
          });
          results.push({ submissionId, status: "released" });
        });
      }
      res.json({ ok: true, results });
    } catch (error) {
      next(error);
    }
  });

  const SubmitExamSchema = z
    .object({
      attemptUuid: z.string().uuid(),
      startedAt: z.string().datetime(),
      submittedAt: z.string().datetime(),
      revision: z.number().int().nonnegative().optional(),
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

  router.post("/exams/assignments/:id/submission", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = SubmitExamSchema.parse(req.body);
      const assignment = await db.examAssignment.findFirst({
        where: { id: req.params.id, studentId: req.user!.id },
        include: {
          examVersion: {
            include: {
              exam: { select: { title: true } },
              questions: { orderBy: { position: "asc" } },
            },
          },
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

      // Validate the complete answer set before creating or changing any session state.
      // Invalid offline submissions must not leave behind a reconciled session.
      const questions = assignment.examVersion.questions;
      const questionById = new Map(questions.map((question) => [question.id, question]));
      if (
        input.answers.length !== questions.length ||
        input.answers.some((answer) => !questionById.has(answer.examQuestionId))
      ) {
        return next(badRequest("Submit one answer entry for every question in this exam."));
      }
      for (const answer of input.answers) {
        const question = questionById.get(answer.examQuestionId)!;
        const optionCount = parseOptions(question.options).length;
        if (answer.selectedIndex !== null && answer.selectedIndex >= optionCount) {
          return next(badRequest("The selected option does not exist for this question."));
        }
      }

      const serverSubmittedAt = new Date();
      const examSession = assignment.session;
      const offlineSessionReconciled = !examSession;
      // Validate offline client time now, but defer all reconciliation writes to
      // the submission transaction so a rejected attempt cannot leave an ACTIVE session.
      const claimedStartedAt = offlineSessionReconciled ? new Date(input.startedAt) : null;
      if (claimedStartedAt) {
        if (!Number.isFinite(claimedStartedAt.getTime()) || claimedStartedAt.getTime() > serverSubmittedAt.getTime() + 60_000) {
          return next(badRequest("The offline exam start time is invalid."));
        }
        if (assignment.availableFrom && claimedStartedAt < assignment.availableFrom) {
          return next(forbidden("The exam was started before its availability window."));
        }
      }
      if (examSession && (examSession.status !== "ACTIVE" || !examSession.startedAt)) {
        return next(conflict("The exam session is not active. Resume it before submitting."));
      }
      const serverStartedAt = examSession?.startedAt ?? claimedStartedAt;
      if (!serverStartedAt) return next(conflict("The exam session has no valid start time."));
      const sessionPausedDurationMs = examSession?.pausedDurationMs ?? 0;
      const sessionLastHeartbeatAt = examSession?.lastHeartbeatAt ?? serverSubmittedAt;
      // A request may arrive just after the due time even when the candidate
      // autosaved answers before the deadline. Keep the submission for review
      // instead of discarding those answers; late timing is marked REVIEW_REQUIRED.
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
      const durationMs = assignment.examVersion.durationMinutes * 60 * 1000 + sessionPausedDurationMs;
      const staleHeartbeat = !sessionLastHeartbeatAt ||
        serverSubmittedAt.getTime() - sessionLastHeartbeatAt.getTime() > 90000;
      const durationDeadlineMs = startedAt.getTime() + durationMs;
      const assignmentDueAtMs = assignment.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const authoritativeDeadlineMs = Math.min(durationDeadlineMs, assignmentDueAtMs);
      const pastAutoSubmitGraceWindow =
        serverSubmittedAt.getTime() > authoritativeDeadlineMs + AUTO_SUBMIT_GRACE_MS;
      const suspiciousTiming =
        offlineSessionReconciled ||
        pastAutoSubmitGraceWindow ||
        staleHeartbeat ||
        (assignment.availableFrom !== null && startedAt < assignment.availableFrom) ||
        new Date(input.startedAt).getTime() < startedAt.getTime() - 60000 ||
        new Date(input.startedAt).getTime() > startedAt.getTime() + 60000;

      let submission: {
        id: string;
        attemptUuid: string;
        status: string;
        score: number | null;
        maximumScore: number | null;
        submittedAt: Date;
        receivedAt: Date;
      };
      let duplicateSubmission = false;
      try {
        submission = await db.$transaction(async (tx) => {
          const existing = await tx.examSubmission.findUnique({
            where: { assignmentId: assignment.id },
          });
          if (existing) {
            if (existing.attemptUuid === input.attemptUuid) {
              duplicateSubmission = true;
              return existing;
            }
            throw conflict("An attempt has already been submitted for this assignment.");
          }

          const duplicateAttempt = await tx.examSubmission.findUnique({
            where: { attemptUuid: input.attemptUuid },
          });
          if (duplicateAttempt) {
            throw conflict("This attempt identifier has already been used.");
          }

          // Check idempotency before reconciling an offline session. The session
          // and its audit event are created inside this transaction so any later
          // failure (including a reused attempt UUID) rolls them back together.
          const submissionSession = examSession ?? await tx.examSession.create({
            data: {
              assignmentId: assignment.id,
              studentId: req.user!.id,
              status: "ACTIVE",
              startedAt: serverStartedAt,
              lastHeartbeatAt: serverSubmittedAt,
              lastActivityAt: serverSubmittedAt,
              events: {
                create: {
                  actorId: req.user!.id,
                  type: "OFFLINE_SESSION_RECONCILED",
                  detail: "An offline exam attempt was reconciled when the device reconnected.",
                },
              },
            },
          });

          if (!offlineSessionReconciled && input.revision !== undefined) {
            const currentRevision = await tx.examSession.updateMany({
              where: {
                id: submissionSession.id,
                status: "ACTIVE",
                startedAt: serverStartedAt,
                answersRevision: input.revision,
              },
              data: { answersRevision: { increment: 1 } },
            });
            if (currentRevision.count !== 1) {
              throw conflict("These answers were changed in another session. Reload the exam before submitting.");
            }
          }

          // Finalize only if the session is still active with the same start time
          // observed before the transaction. This prevents a concurrent invigilator
          // pause or termination from being overwritten by a late submission.
          const completedSession = await tx.examSession.updateMany({
            where: {
              id: submissionSession.id,
              status: "ACTIVE",
              startedAt: serverStartedAt,
            },
            data: { status: "COMPLETED", endedAt: serverSubmittedAt, lastActivityAt: serverSubmittedAt },
          });
          if (completedSession.count !== 1) {
            const concurrentSubmission = await tx.examSubmission.findUnique({
              where: { assignmentId: assignment.id },
            });
            if (concurrentSubmission?.attemptUuid === input.attemptUuid) {
              duplicateSubmission = true;
              return concurrentSubmission;
            }
            throw conflict("The exam session changed before submission was finalized. Refresh and contact the invigilator.");
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
          await tx.studentNotification.create({
            data: {
              userId: req.user!.id,
              kind: suspiciousTiming ? "EXAM_REVIEW" : "EXAM_RESULT",
              title: suspiciousTiming ? "Submission awaiting review" : "Exam result available",
              message: suspiciousTiming
                ? `Your submission for ${assignment.examVersion.exam.title} was received and is awaiting invigilator review.`
                : `Your submission for ${assignment.examVersion.exam.title} has been graded. Open the result to see your score.`,
              href: `/assignments/${assignment.id}/result`,
              dedupeKey: `exam-submission:${created.id}`,
            },
          });
          await tx.examSessionEvent.create({
            data: { sessionId: submissionSession.id, actorId: req.user!.id, type: "SUBMITTED", detail: suspiciousTiming ? "Submission retained for invigilator review due to timing or connectivity signals." : "Candidate submitted the examination." },
          });
          return created;
      });

      } catch (error) {
        // Concurrent retries can lose at different points in the transaction:
        // the unique assignment insert (P2002), the session-finalization guard,
        // or the answer-revision guard. Once the winner commits, all of these
        // paths must return its result when the idempotency key matches.
        const duplicate = await db.examSubmission.findUnique({
          where: { assignmentId: assignment.id },
          select: {
            id: true, attemptUuid: true, status: true, score: true,
            maximumScore: true, submittedAt: true, receivedAt: true,
          },
        });
        if (duplicate?.attemptUuid === input.attemptUuid) {
          return res.json({ ok: true, duplicate: true, submission: duplicate });
        }
        throw error;
      }

      res.status(duplicateSubmission ? 200 : 201).json({ ok: true, duplicate: duplicateSubmission, submission });
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

      const released = assignment.submission.status === "GRADED";
      const answersByQuestion = new Map(
        assignment.submission.answers.map((answer) => [answer.examQuestionId, answer])
      );
      res.json({
        ok: true,
        result: {
          submissionId: assignment.submission.id,
          status: assignment.submission.status,
          score: released ? assignment.submission.score : null,
          maximumScore: released ? assignment.submission.maximumScore : null,
          submittedAt: assignment.submission.submittedAt,
          receivedAt: assignment.submission.receivedAt,
          questions: released ? assignment.examVersion.questions.map((question) => {
            const answer = answersByQuestion.get(question.id);
            return {
              id: question.id,
              position: question.position,
              subject: question.subject,
              topic: question.topic,
              relatedConcepts: getLearningConceptsForTopic(question.topic),
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
          }) : [],
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
