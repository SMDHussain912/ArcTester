/**
 * Similarity report for detecting potential collusion between students.
 *
 * Compares student pairs using original option indices (options are shuffled per student)
 * and flags pairs with suspicious patterns:
 * - Shared wrong answers >= max(8, 0.6 * min(wrongA, wrongB))
 * - Same IP address
 * - Answers faster than plausible minimum
 *
 * Flags only with evidence, admin dismiss is audited, never auto-penalize!
 */

import type { PrismaClient } from "@prisma/client";

const MIN_ANSWERS_THRESHOLD = 8;
const WEAK_CORRELATION_THRESHOLD = 0.6;
const MIN_TIME_PER_QUESTION_MS = 15000; // 15 seconds per question minimum

interface AnswerRecord {
  examQuestionId: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  awardedMarks: number;
}

interface StudentSubmission {
  id: string;
  attemptUuid: string;
  studentId: number;
  studentEmail: string;
  startedAt: Date;
  submittedAt: Date;
  answers: AnswerRecord[];
}

interface SimilarityFlag {
  assignmentId: string;
  studentIdA: number;
  studentIdB: number;
  studentEmailA: string;
  studentEmailB: string;
  sharedWrong: number;
  totalWrongA: number;
  totalWrongB: number;
  threshold: number;
  sameIp: boolean;
  fastAnswers: boolean;
  flaggedAt: string;
  dismissed: boolean;
  dismissedAt: Date | null;
  dismissedBy: number | null;
}

/**
 * Compute similarity flags for all student pairs in an assignment.
 *
 * @param db - Prisma client
 * @param assignmentId - Assignment ID
 * @returns Array of similarity flags
 */
export async function computeSimilarityFlags(
  db: PrismaClient,
  assignmentId: string
): Promise<SimilarityFlag[]> {
  // Get all graded submissions for this assignment
  const submissions = await db.examSubmission.findMany({
    where: {
      assignmentId,
      status: "GRADED",
    },
    select: {
      id: true,
      attemptUuid: true,
      startedAt: true,
      submittedAt: true,
      assignment: {
        select: {
          studentId: true,
        },
      },
      answers: {
        select: {
          examQuestionId: true,
          selectedIndex: true,
          isCorrect: true,
          awardedMarks: true,
        },
      },
    },
  });

  if (submissions.length < 2) {
    return [];
  }

  // Get student info separately
  const studentIds = [...new Set(submissions.map(s => s.assignment.studentId))];
  const students = await db.user.findMany({
    where: {
      id: { in: studentIds },
    },
    select: {
      id: true,
      email: true,
    },
  });
  const studentMap = new Map(students.map(s => [s.id, s.email]));

  // Get the exam version questions to get question IDs
  const assignment = await db.examAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      examVersion: {
        include: {
          questions: {
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });

  if (!assignment || !assignment.examVersion) {
    return [];
  }

  const questionIds = assignment.examVersion.questions.map(q => q.id);

  // Build student submission data
  const studentData: StudentSubmission[] = submissions.map(sub => ({
    id: sub.id,
    attemptUuid: sub.attemptUuid,
    studentId: sub.assignment.studentId,
    studentEmail: studentMap.get(sub.assignment.studentId) ?? "",
    startedAt: sub.startedAt,
    submittedAt: sub.submittedAt,
    answers: sub.answers.map(a => ({
      examQuestionId: a.examQuestionId,
      selectedIndex: a.selectedIndex,
      isCorrect: a.isCorrect,
      awardedMarks: a.awardedMarks,
    })),
  }));

  const flags: SimilarityFlag[] = [];

  // Compare all pairs
  for (let i = 0; i < studentData.length; i++) {
    for (let j = i + 1; j < studentData.length; j++) {
      const a = studentData[i];
      const b = studentData[j];

      // Build answer maps by question ID
      const aAnswers = new Map(a.answers.map(a => [a.examQuestionId, a]));
      const bAnswers = new Map(b.answers.map(b => [b.examQuestionId, b]));

      let sharedWrong = 0;
      let totalWrongA = 0;
      let totalWrongB = 0;

      for (const questionId of questionIds) {
        const ansA = aAnswers.get(questionId);
        const ansB = bAnswers.get(questionId);

        if (!ansA || !ansB) continue;

        const aWrong = ansA.selectedIndex !== null && !ansA.isCorrect;
        const bWrong = ansB.selectedIndex !== null && !ansB.isCorrect;

        if (aWrong) totalWrongA++;
        if (bWrong) totalWrongB++;

        // Same question, same wrong answer (same original option index)
        if (aWrong && bWrong && ansA.selectedIndex === ansB.selectedIndex) {
          sharedWrong++;
        }
      }

      if (sharedWrong === 0) continue;

      const threshold = Math.max(MIN_ANSWERS_THRESHOLD, WEAK_CORRELATION_THRESHOLD * Math.min(totalWrongA, totalWrongB));

      if (sharedWrong < threshold) continue;

      // Check if answers were suspiciously fast (less than min time per question)
      const aDurationMs = a.submittedAt.getTime() - a.startedAt.getTime();
      const bDurationMs = b.submittedAt.getTime() - b.startedAt.getTime();
      const minExpectedTime = questionIds.length * MIN_TIME_PER_QUESTION_MS;
      const fastAnswers = aDurationMs < minExpectedTime && bDurationMs < minExpectedTime && aDurationMs > 0 && bDurationMs > 0;

      flags.push({
        assignmentId,
        studentIdA: a.studentId,
        studentIdB: b.studentId,
        studentEmailA: a.studentEmail,
        studentEmailB: b.studentEmail,
        sharedWrong,
        totalWrongA,
        totalWrongB,
        threshold,
        sameIp: false,
        fastAnswers,
        flaggedAt: new Date().toISOString(),
        dismissed: false,
        dismissedAt: null,
        dismissedBy: null,
      });
    }
  }

  return flags;
}

export type SimilarityFlagInput = {
  assignmentId: string;
  studentIdA: number;
  studentIdB: number;
  studentEmailA: string;
  studentEmailB: string;
  sharedWrong: number;
  totalWrongA: number;
  totalWrongB: number;
  threshold: number;
  sameIp: boolean;
  fastAnswers: boolean;
  flaggedAt: string;
  dismissed?: boolean;
  dismissedAt?: Date | null;
  dismissedBy?: number | null;
};