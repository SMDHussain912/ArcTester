// Analytics service: weak-topics report, score history, progress export/import.
// Personal backup only — import validates strictly (Zod), never invents
// questions, and merges stats/attempts without duplicating rows.

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { badRequest } from "./errors.js";
import { buildPerformanceExplanation, type PerformanceExplanation } from "./intelligence/performanceExplanation.js";
import { buildRuleBasedRecommendations } from "./intelligence/ruleBasedRecommendations.js";

export interface TopicRow {
  subject: string;
  topic: string | null;
  /** Answered questions only: correct + incorrect. */
  seen: number;
  correct: number;
  wrong: number;
  incorrect: number;
  unanswered: number;
  /** Correct / answered. Null when there are no answered questions. */
  accuracy: number | null;
}

export interface WeakTopicsReport {
  subjects: TopicRow[];
  topics: TopicRow[];
  /** Weakest subject or topic first (lowest accuracy, ties by wrong desc). */
  weakest: TopicRow | null;
}

export interface HistoryItem {
  attemptId: number;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  score: number;
  total: number;
  expired: boolean;
}

export interface ExportPayload {
  exportedAt: string;
  stats: { questionId: number; seen: number; wrong: number; lastSeen: string | null }[];
  attempts: HistoryItem[];
  answers: {
    attemptId: number;
    questionId: number;
    chosen: number | null;
    isCorrect: boolean;
    subjectSnapshot: string;
    topicSnapshot: string | null;
    difficultySnapshot: string;
  }[];
}

export interface ImportReport {
  addedStats: number;
  updatedStats: number;
  addedAttempts: number;
  skippedDuplicates: number;
}

function sortWeakest(rows: TopicRow[]): TopicRow[] {
  return [...rows].sort((a, b) => {
    if (a.accuracy === null && b.accuracy === null) return 0;
    if (a.accuracy === null) return 1;
    if (b.accuracy === null) return -1;
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    return b.wrong - a.wrong;
  });
}

/**
 * Accuracy is derived from completed answer rows, never from Stat.wrong.
 * Stat.wrong is a question-selection debt counter and also changes for
 * unanswered responses, so it is not an observed incorrect-answer total.
 */
export async function getWeakTopics(db: PrismaClient, userId: number): Promise<WeakTopicsReport> {
  const aggregates = await db.$queryRaw<Array<{
    subject: string; topic: string | null; correct: number; wrong: number; unanswered: number;
  }>>`
    SELECT
      COALESCE(NULLIF(aa."subjectSnapshot", ''), s.name) AS subject,
      CASE WHEN aa."subjectSnapshot" <> '' THEN aa."topicSnapshot" ELSE t.name END AS topic,
      SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = TRUE THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = FALSE THEN 1 ELSE 0 END) AS wrong,
      SUM(CASE WHEN aa.chosen IS NULL THEN 1 ELSE 0 END) AS unanswered
    FROM "AttemptAnswer" aa
    INNER JOIN "Attempt" a ON a.id = aa."attemptId"
    INNER JOIN "Question" q ON q.id = aa."questionId"
    INNER JOIN "Subject" s ON s.id = q."subjectId"
    LEFT JOIN "Topic" t ON t.id = q."topicId"
    WHERE a."userId" = ${userId} AND a."finishedAt" IS NOT NULL
    GROUP BY subject, topic
  `;

  type Counts = { correct: number; wrong: number; unanswered: number };
  const bySubject = new Map<string, Counts>();
  const byTopic = new Map<string, { subject: string; topic: string | null; counts: Counts }>();
  for (const aggregate of aggregates) {
    const counts = {
      correct: Number(aggregate.correct ?? 0),
      wrong: Number(aggregate.wrong ?? 0),
      unanswered: Number(aggregate.unanswered ?? 0),
    };
    const subjectCounts = bySubject.get(aggregate.subject) ?? { correct: 0, wrong: 0, unanswered: 0 };
    subjectCounts.correct += counts.correct;
    subjectCounts.wrong += counts.wrong;
    subjectCounts.unanswered += counts.unanswered;
    bySubject.set(aggregate.subject, subjectCounts);
    byTopic.set(JSON.stringify([aggregate.subject, aggregate.topic]), {
      subject: aggregate.subject, topic: aggregate.topic, counts,
    });
  }

  const toRow = (subject: string, topic: string | null, counts: Counts): TopicRow => {
    const seen = counts.correct + counts.wrong;
    return {
      subject, topic, seen, correct: counts.correct, wrong: counts.wrong,
      incorrect: counts.wrong, unanswered: counts.unanswered,
      accuracy: seen > 0 ? counts.correct / seen : null,
    };
  };
  const subjects = sortWeakest([...bySubject.entries()].map(([name, counts]) => toRow(name, null, counts)));
  const topics = sortWeakest([...byTopic.values()].map((entry) => toRow(entry.subject, entry.topic, entry.counts)));
  const candidates = sortWeakest([...subjects, ...topics].filter((row) => row.accuracy !== null));
  return { subjects, topics, weakest: candidates[0] ?? null };
}

export const QUESTION_ANALYTICS_MINIMUM_ANSWERS = 5;
export const QUESTION_ANALYTICS_WEAK_ACCURACY = 0.6;

export interface QuestionPerformanceRow {
  questionId: number;
  subject: string;
  topic: string | null;
  difficulty: string;
  seen: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  accuracy: number | null;
  sampleSize: number;
  sufficientData: boolean;
  weak: boolean;
}

export interface QuestionPerformanceReport {
  generatedAt: string;
  minimumAnswers: number;
  weakAccuracyThreshold: number;
  questions: QuestionPerformanceRow[];
  insufficientSampleCount: number;
}

/** Per-question metrics are private to the authenticated learner. */
export async function getQuestionPerformance(
  db: PrismaClient,
  userId: number
): Promise<QuestionPerformanceReport> {
  const aggregates = await db.$queryRaw<Array<{
    questionId: number; subject: string; topic: string | null; difficulty: string;
    correct: number; incorrect: number; unanswered: number;
  }>>`
    SELECT
      aa."questionId" AS "questionId",
      MAX(COALESCE(NULLIF(aa."subjectSnapshot", ''), s.name)) AS subject,
      MAX(CASE WHEN aa."subjectSnapshot" <> '' THEN aa."topicSnapshot" ELSE t.name END) AS topic,
      MAX(COALESCE(NULLIF(aa."difficultySnapshot", ''), q.difficulty)) AS difficulty,
      SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = TRUE THEN 1 ELSE 0 END) AS correct,
      SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = FALSE THEN 1 ELSE 0 END) AS incorrect,
      SUM(CASE WHEN aa.chosen IS NULL THEN 1 ELSE 0 END) AS unanswered
    FROM "AttemptAnswer" aa
    INNER JOIN "Attempt" a ON a.id = aa."attemptId"
    INNER JOIN "Question" q ON q.id = aa."questionId"
    INNER JOIN "Subject" s ON s.id = q."subjectId"
    LEFT JOIN "Topic" t ON t.id = q."topicId"
    WHERE a."userId" = ${userId} AND a."finishedAt" IS NOT NULL
    GROUP BY aa."questionId"
  `;
  const questions: QuestionPerformanceRow[] = aggregates.map((row) => {
    const correct = Number(row.correct ?? 0);
    const incorrect = Number(row.incorrect ?? 0);
    const unanswered = Number(row.unanswered ?? 0);
    const seen = correct + incorrect;
    const accuracy = seen > 0 ? correct / seen : null;
    const sufficientData = seen >= QUESTION_ANALYTICS_MINIMUM_ANSWERS;
    return {
      questionId: row.questionId, subject: row.subject, topic: row.topic,
      difficulty: row.difficulty, seen, correct, incorrect, unanswered,
      accuracy, sampleSize: seen, sufficientData,
      weak: sufficientData && accuracy !== null && accuracy < QUESTION_ANALYTICS_WEAK_ACCURACY,
    };
  }).sort((a, b) => {
    if (a.weak !== b.weak) return a.weak ? -1 : 1;
    if (a.accuracy === null && b.accuracy !== null) return 1;
    if (b.accuracy === null && a.accuracy !== null) return -1;
    return (a.accuracy ?? 1) - (b.accuracy ?? 1) || b.sampleSize - a.sampleSize;
  });
  return {
    generatedAt: new Date().toISOString(),
    minimumAnswers: QUESTION_ANALYTICS_MINIMUM_ANSWERS,
    weakAccuracyThreshold: QUESTION_ANALYTICS_WEAK_ACCURACY,
    insufficientSampleCount: questions.filter((row) => !row.sufficientData).length,
    questions,
  };
}

export interface PerformanceOverview {
  generatedAt: string;
  practice: {
    completedAttempts: number;
    questions: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number | null;
    subjects: TopicRow[];
    difficulty: {
      difficulty: string;
      correct: number;
      incorrect: number;
      unanswered: number;
      accuracy: number | null;
      answered: number;
    }[];
    trend: { attemptId: number; finishedAt: string; accuracy: number | null; correct: number; total: number }[];
  };
  formalExams: {
    submissions: number;
    graded: number;
    reviewRequired: number;
    score: number;
    maximumScore: number;
    scorePercentage: number | null;
    correct: number;
    incorrect: number;
    unanswered: number;
    subjects: {
      subject: string;
      correct: number;
      incorrect: number;
      unanswered: number;
      accuracy: number | null;
      awardedMarks: number;
      maximumMarks: number;
    }[];
  };
}

/** Practice and formal assessments remain separate because their scoring rules differ. */
export async function getPerformanceOverview(
  db: PrismaClient,
  userId: number
): Promise<PerformanceOverview> {
  const [
    practiceAttemptCount,
    practiceTotalsRows,
    recentAttempts,
    weakTopics,
    difficultyRows,
    submissionCount,
    gradedCount,
    reviewRequiredCount,
    gradedTotals,
    formalRows,
  ] = await Promise.all([
    db.attempt.count({ where: { userId, finishedAt: { not: null } } }),
    db.$queryRaw<Array<{ correct: number; incorrect: number; unanswered: number }>>`
      SELECT
        SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = TRUE THEN 1 ELSE 0 END) AS correct,
        SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = FALSE THEN 1 ELSE 0 END) AS incorrect,
        SUM(CASE WHEN aa.chosen IS NULL THEN 1 ELSE 0 END) AS unanswered
      FROM "AttemptAnswer" aa
      INNER JOIN "Attempt" a ON a.id = aa."attemptId"
      WHERE a."userId" = ${userId} AND a."finishedAt" IS NOT NULL
    `,
    db.attempt.findMany({
      where: { userId, finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      take: 12,
      select: {
        id: true, finishedAt: true,
        answers: { select: { chosen: true, isCorrect: true } },
      },
    }),
    getWeakTopics(db, userId),
    db.$queryRaw<Array<{ difficulty: string; correct: number; incorrect: number; unanswered: number }>>`
      SELECT
        aa."difficultySnapshot" AS difficulty,
        SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = TRUE THEN 1 ELSE 0 END) AS correct,
        SUM(CASE WHEN aa.chosen IS NOT NULL AND aa."isCorrect" = FALSE THEN 1 ELSE 0 END) AS incorrect,
        SUM(CASE WHEN aa.chosen IS NULL THEN 1 ELSE 0 END) AS unanswered
      FROM "AttemptAnswer" aa
      INNER JOIN "Attempt" a ON a.id = aa."attemptId"
      WHERE a."userId" = ${userId} AND a."finishedAt" IS NOT NULL
      GROUP BY aa."difficultySnapshot"
    `,
    db.examSubmission.count({ where: { assignment: { studentId: userId } } }),
    db.examSubmission.count({ where: { status: "GRADED", assignment: { studentId: userId } } }),
    db.examSubmission.count({ where: { status: "REVIEW_REQUIRED", assignment: { studentId: userId } } }),
    db.examSubmission.aggregate({
      where: { status: "GRADED", assignment: { studentId: userId } },
      _sum: { score: true, maximumScore: true },
    }),
    db.$queryRaw<Array<{
      subject: string; correct: number; incorrect: number; unanswered: number;
      awardedMarks: number; maximumMarks: number;
    }>>`
      SELECT eq.subject AS subject,
        SUM(CASE WHEN ea."selectedIndex" IS NOT NULL AND ea."isCorrect" = TRUE THEN 1 ELSE 0 END) AS correct,
        SUM(CASE WHEN ea."selectedIndex" IS NOT NULL AND ea."isCorrect" = FALSE THEN 1 ELSE 0 END) AS incorrect,
        SUM(CASE WHEN ea."selectedIndex" IS NULL THEN 1 ELSE 0 END) AS unanswered,
        SUM(ea."awardedMarks") AS "awardedMarks",
        SUM(eq.marks) AS "maximumMarks"
      FROM "ExamSubmissionAnswer" ea
      INNER JOIN "ExamSubmission" es ON es.id = ea."submissionId"
      INNER JOIN "ExamVersionQuestion" eq ON eq.id = ea."examQuestionId"
      WHERE es.status = 'GRADED' AND es."assignmentId" IN (
        SELECT id FROM "ExamAssignment" WHERE "studentId" = ${userId}
      )
      GROUP BY eq.subject
    `,
  ]);

  const practiceCorrect = Number(practiceTotalsRows[0]?.correct ?? 0);
  const practiceIncorrect = Number(practiceTotalsRows[0]?.incorrect ?? 0);
  const practiceUnanswered = Number(practiceTotalsRows[0]?.unanswered ?? 0);
  const practiceAnswered = practiceCorrect + practiceIncorrect;
  const trend = [...recentAttempts].reverse().map((attempt) => {
    const correct = attempt.answers.filter((answer) => answer.chosen !== null && answer.isCorrect).length;
    const incorrect = attempt.answers.filter((answer) => answer.chosen !== null && !answer.isCorrect).length;
    const answered = correct + incorrect;
    return {
      attemptId: attempt.id,
      finishedAt: attempt.finishedAt!.toISOString(),
      accuracy: answered > 0 ? correct / answered : null,
      correct,
      total: attempt.answers.length,
    };
  });

  const formalCorrect = formalRows.reduce((sum, row) => sum + Number(row.correct ?? 0), 0);
  const formalIncorrect = formalRows.reduce((sum, row) => sum + Number(row.incorrect ?? 0), 0);
  const formalUnanswered = formalRows.reduce((sum, row) => sum + Number(row.unanswered ?? 0), 0);
  const formalScore = gradedTotals._sum.score ?? 0;
  const formalMaximum = gradedTotals._sum.maximumScore ?? 0;
  const formalSubjects = formalRows.map((row) => {
    const correct = Number(row.correct ?? 0), incorrect = Number(row.incorrect ?? 0), unanswered = Number(row.unanswered ?? 0);
    return {
      subject: row.subject, correct, incorrect, unanswered,
      awardedMarks: Number(row.awardedMarks ?? 0), maximumMarks: Number(row.maximumMarks ?? 0),
      accuracy: correct + incorrect > 0 ? correct / (correct + incorrect) : null,
    };
  }).sort((a, b) => (a.accuracy ?? 2) - (b.accuracy ?? 2));

  return {
    generatedAt: new Date().toISOString(),
    practice: {
      completedAttempts: practiceAttemptCount,
      questions: practiceCorrect + practiceIncorrect + practiceUnanswered,
      correct: practiceCorrect, incorrect: practiceIncorrect, unanswered: practiceUnanswered,
      accuracy: practiceAnswered > 0 ? practiceCorrect / practiceAnswered : null,
      subjects: weakTopics.subjects,
      difficulty: difficultyRows.map((row) => {
        const correct = Number(row.correct ?? 0);
        const incorrect = Number(row.incorrect ?? 0);
        const unanswered = Number(row.unanswered ?? 0);
        const answered = correct + incorrect;
        return {
          difficulty: row.difficulty,
          correct,
          incorrect,
          unanswered,
          answered,
          accuracy: answered > 0 ? correct / answered : null,
        };
      }).sort((a, b) => ["easy", "medium", "hard"].indexOf(a.difficulty) - ["easy", "medium", "hard"].indexOf(b.difficulty)),
      trend,
    },
    formalExams: {
      submissions: submissionCount, graded: gradedCount, reviewRequired: reviewRequiredCount,
      score: formalScore, maximumScore: formalMaximum,
      scorePercentage: formalMaximum > 0 ? (formalScore / formalMaximum) * 100 : null,
      correct: formalCorrect, incorrect: formalIncorrect, unanswered: formalUnanswered,
      subjects: formalSubjects,
    },
  };
}

export interface HistoryPage {
  items: HistoryItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export async function getHistory(
  db: PrismaClient,
  userId: number,
  page = 1,
  limit = 10
): Promise<HistoryPage> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const [rows, total] = await Promise.all([
    db.$queryRaw<Array<{
      attemptId: number; mode: string; startedAt: Date; finishedAt: Date | null;
      expired: boolean; score: number; total: number;
    }>>`
      SELECT a.id AS "attemptId", a.mode AS mode, a."startedAt" AS "startedAt",
        a."finishedAt" AS "finishedAt", a.expired AS expired,
        SUM(CASE WHEN aa."isCorrect" = TRUE THEN 1 ELSE 0 END) AS score,
        COUNT(aa.id) AS total
      FROM "Attempt" a
      LEFT JOIN "AttemptAnswer" aa ON aa."attemptId" = a.id
      WHERE a."userId" = ${userId} AND a."finishedAt" IS NOT NULL
      GROUP BY a.id
      ORDER BY a."finishedAt" DESC, a.id DESC
      LIMIT ${safeLimit} OFFSET ${(safePage - 1) * safeLimit}
    `,
    db.attempt.count({ where: { userId, finishedAt: { not: null } } }),
  ]);
  return {
    items: rows.map((row) => ({
      attemptId: Number(row.attemptId), mode: row.mode,
      startedAt: new Date(row.startedAt).toISOString(),
      finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
      score: Number(row.score ?? 0), total: Number(row.total ?? 0), expired: Boolean(row.expired),
    })),
    page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit),
  };
}

export const RECOMMENDATION_MINIMUM_ANSWERS = 5;
export const RECOMMENDATION_WEAK_ACCURACY = 0.6;
export const RECOMMENDATION_RECENT_PRACTICE_DAYS = 7;

export interface StudyRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  reason: string;
  subject: string | null;
  topic: string | null;
  mode: "practice" | "mistakes" | "mock";
  questionCount: number;
  evidence: {
    answeredQuestions: number;
    incorrectAnswers: number;
    accuracy: number | null;
    minimumAnswers: number;
    weakAccuracyThreshold: number;
  } | null;
}

export interface StudyRecommendationsReport {
  generatedAt: string;
  basedOnAttempts: number;
  minimumAnswers: number;
  weakAccuracyThreshold: number;
  performanceExplanation: PerformanceExplanation;
  recommendations: StudyRecommendation[];
}

/**
 * Turns a learner's own completed practice answers into transparent next steps.
 * Weak-topic recommendations require a minimum sample; low-sample data only
 * produces a baseline-building action. This is deterministic guidance.
 */
export async function getStudyRecommendations(
  db: PrismaClient,
  userId: number
): Promise<StudyRecommendationsReport> {
  const [weakTopics, history, recentActivity] = await Promise.all([
    getWeakTopics(db, userId),
    getHistory(db, userId, 1, 1),
    db.$queryRaw<Array<{ subject: string; topic: string | null; lastPracticedAt: Date }>>`
      SELECT
        CASE WHEN aa."subjectSnapshot" <> '' THEN aa."subjectSnapshot" ELSE s.name END AS subject,
        CASE WHEN aa."subjectSnapshot" <> '' THEN aa."topicSnapshot" ELSE t.name END AS topic,
        MAX(a."finishedAt") AS "lastPracticedAt"
      FROM "AttemptAnswer" aa
      INNER JOIN "Attempt" a ON a.id = aa."attemptId"
      INNER JOIN "Question" q ON q.id = aa."questionId"
      INNER JOIN "Subject" s ON s.id = q."subjectId"
      LEFT JOIN "Topic" t ON t.id = q."topicId"
      WHERE a."userId" = ${userId} AND a."finishedAt" IS NOT NULL
      GROUP BY subject, topic
    `,
  ]);
  const ruleBased = buildRuleBasedRecommendations({
    topics: weakTopics.topics,
    subjects: weakTopics.subjects,
    recentActivity,
    minimumAnswers: RECOMMENDATION_MINIMUM_ANSWERS,
    weakAccuracyThreshold: RECOMMENDATION_WEAK_ACCURACY,
    recentPracticeDays: RECOMMENDATION_RECENT_PRACTICE_DAYS,
    now: Date.now(),
  });
  const recommendations: StudyRecommendation[] = [...ruleBased.recommendations];

  if (recommendations.length === 0) {
    const hasAnsweredEvidence = weakTopics.topics.some((row) => row.seen > 0);
    recommendations.push({
      id: history.total > 0 ? "build-subject-baseline" : "start-diagnostic-practice",
      priority: "low",
      title: history.total > 0 ? "Build a stronger topic baseline" : "Start with a diagnostic practice session",
      reason: history.total > 0
        ? ruleBased.recentlyPracticedWeakCount > 0
          ? `Your weak-topic evidence is valid, but ${ruleBased.recentlyPracticedWeakCount} weak area(s) were practiced within the last ${RECOMMENDATION_RECENT_PRACTICE_DAYS} days. Review those recent answers and explanations before receiving another revision prompt.`
          : `No area currently meets both evidence rules: at least ${RECOMMENDATION_MINIMUM_ANSWERS} answered questions and accuracy below ${Math.round(RECOMMENDATION_WEAK_ACCURACY * 100)}%. ${hasAnsweredEvidence ? "Continue focused practice to build reliable topic-level evidence." : "Complete a focused practice session to begin collecting answered-question evidence."}`
        : "There is not enough attempt history yet. Complete your first practice session to unlock recommendations based on your results.",
      subject: null,
      topic: null,
      mode: "practice",
      questionCount: history.total > 0 ? 15 : 10,
      evidence: null,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    basedOnAttempts: history.total,
    minimumAnswers: RECOMMENDATION_MINIMUM_ANSWERS,
    weakAccuracyThreshold: RECOMMENDATION_WEAK_ACCURACY,
    performanceExplanation: buildPerformanceExplanation(
      weakTopics.topics,
      RECOMMENDATION_MINIMUM_ANSWERS,
      RECOMMENDATION_WEAK_ACCURACY,
      weakTopics.subjects,
    ),
    recommendations,
  };
}

export async function exportProgress(
  db: PrismaClient,
  userId: number
): Promise<ExportPayload> {
  const stats = await db.stat.findMany({
    where: { userId },
    select: { questionId: true, seen: true, wrong: true, lastSeen: true },
  });
  const firstHistoryPage = await getHistory(db, userId, 1, 50);
  const history = [...firstHistoryPage.items];
  for (let page = 2; page <= firstHistoryPage.totalPages; page += 1) {
    const nextPage = await getHistory(db, userId, page, 50);
    history.push(...nextPage.items);
  }
  const attemptIds = history.map((h) => h.attemptId);
  const answers =
    attemptIds.length > 0
      ? await db.attemptAnswer.findMany({
          where: { attemptId: { in: attemptIds } },
          select: {
            attemptId: true,
            questionId: true,
            chosen: true,
            isCorrect: true,
            subjectSnapshot: true,
            topicSnapshot: true,
            difficultySnapshot: true,
          },
        })
      : [];

  return {
    exportedAt: new Date().toISOString(),
    stats: stats.map((s) => ({
      questionId: s.questionId,
      seen: s.seen,
      wrong: s.wrong,
      lastSeen: s.lastSeen ? s.lastSeen.toISOString() : null,
    })),
    attempts: history,
    answers: answers.map((a) => ({
      attemptId: a.attemptId,
      questionId: a.questionId,
      chosen: a.chosen,
      isCorrect: a.isCorrect,
      subjectSnapshot: a.subjectSnapshot,
      topicSnapshot: a.topicSnapshot,
      difficultySnapshot: a.difficultySnapshot,
    })),
  };
}

const ImportStatSchema = z.object({
  questionId: z.number().int().positive(),
  seen: z.number().int().nonnegative(),
  wrong: z.number().int().nonnegative(),
  lastSeen: z.string().datetime().nullable().optional(),
}).refine((stat) => stat.wrong <= stat.seen, {
  message: "wrong cannot exceed seen",
  path: ["wrong"],
});

const ImportAttemptSchema = z.object({
  attemptId: z.number().int().positive(),
  mode: z.string(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable().optional(),
  score: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  expired: z.boolean().optional(),
});

const ImportAnswerSchema = z.object({
  attemptId: z.number().int().positive(),
  questionId: z.number().int().positive(),
  chosen: z.number().int().min(0).max(3).nullable(),
  isCorrect: z.boolean(),
  subjectSnapshot: z.string().trim().max(80).optional(),
  topicSnapshot: z.string().trim().max(80).nullable().optional(),
  difficultySnapshot: z.enum(["easy", "medium", "hard"]).optional(),
});

export const MAX_PROGRESS_IMPORT_STATS = 20_000;
export const MAX_PROGRESS_IMPORT_ATTEMPTS = 5_000;
export const MAX_PROGRESS_IMPORT_ANSWERS = 50_000;

const ImportPayloadSchema = z.object({
  exportedAt: z.string().datetime().optional(),
  stats: z.array(ImportStatSchema).max(MAX_PROGRESS_IMPORT_STATS).optional().default([]),
  attempts: z.array(ImportAttemptSchema).max(MAX_PROGRESS_IMPORT_ATTEMPTS).optional().default([]),
  answers: z.array(ImportAnswerSchema).max(MAX_PROGRESS_IMPORT_ANSWERS).optional().default([]),
}).superRefine((payload, ctx) => {
  const statIds = new Set<number>();
  payload.stats.forEach((stat, index) => {
    if (statIds.has(stat.questionId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stats", index, "questionId"], message: "duplicate questionId in stats" });
    }
    statIds.add(stat.questionId);
  });

  const attemptIds = new Set<number>();
  payload.attempts.forEach((attempt, index) => {
    if (attemptIds.has(attempt.attemptId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["attempts", index, "attemptId"], message: "duplicate attemptId in attempts" });
    }
    attemptIds.add(attempt.attemptId);
  });

  const answerKeys = new Set<string>();
  payload.answers.forEach((answer, index) => {
    const key = JSON.stringify([answer.attemptId, answer.questionId]);
    if (answerKeys.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["answers", index], message: "duplicate answer for attempt and question" });
    }
    answerKeys.add(key);
    if (!attemptIds.has(answer.attemptId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["answers", index, "attemptId"], message: "answer references an attempt missing from this backup" });
    }
  });
});

export async function importProgress(
  db: PrismaClient,
  userId: number,
  raw: unknown
): Promise<ImportReport> {
  const parsed = ImportPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest(
      "The backup file is not valid: " +
        parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ")
    );
  }
  const { stats, attempts, answers } = parsed.data;

  // Every referenced question must exist — import never invents questions.
  const questionIds = new Set([
    ...stats.map((s) => s.questionId),
    ...answers.map((a) => a.questionId),
  ]);
  const existing = await db.question.findMany({
    where: { id: { in: [...questionIds] } },
    select: {
      id: true,
      difficulty: true,
      subject: { select: { name: true } },
      topic: { select: { name: true } },
    },
  });
  const questionById = new Map(existing.map((question) => [question.id, question]));
  const missing = [...questionIds].filter((id) => !questionById.has(id));
  if (missing.length > 0) {
    throw badRequest(`Backup references unknown questions: ${missing.join(", ")}`);
  }

  return db.$transaction(async (tx) => {
    // Stats merge into THIS user's rows only.
    let addedStats = 0;
    let updatedStats = 0;
    for (const s of stats) {
      const prev = await tx.stat.findUnique({
        where: { userId_questionId: { userId, questionId: s.questionId } },
      });
      if (!prev) {
        await tx.stat.create({
          data: {
            userId,
            questionId: s.questionId,
            seen: s.seen,
            wrong: s.wrong,
            lastSeen: s.lastSeen ? new Date(s.lastSeen) : null,
          },
        });
        addedStats += 1;
      } else {
        await tx.stat.update({
          where: { userId_questionId: { userId, questionId: s.questionId } },
          data: {
            seen: prev.seen + s.seen,
            wrong: prev.wrong + s.wrong,
            lastSeen: s.lastSeen ? new Date(s.lastSeen) : prev.lastSeen,
          },
        });
        updatedStats += 1;
      }
    }
  
    // Attempts keep their id when it is free (or already ours); otherwise they
    // get a fresh id so one user's backup can never overwrite another's rows.
    // `attemptIdMap` translates the backup's ids to the ids actually stored.
    const attemptIdMap = new Map<number, number>();
    let addedAttempts = 0;
    let skippedDuplicates = 0;
    for (const a of attempts) {
      const prev = await tx.attempt.findUnique({ where: { id: a.attemptId } });
      if (prev) {
        if (prev.userId === userId) {
          // Already imported into this account — keep the original id.
          attemptIdMap.set(a.attemptId, prev.id);
          skippedDuplicates += 1;
          continue;
        }
        // Owned by somebody else: re-import under a new id instead of clobbering.
        const created = await tx.attempt.create({
          data: {
            mode: a.mode,
            userId,
            startedAt: new Date(a.startedAt),
            finishedAt: a.finishedAt ? new Date(a.finishedAt) : null,
            expired: a.expired ?? false,
          },
        });
        attemptIdMap.set(a.attemptId, created.id);
        addedAttempts += 1;
        continue;
      }
      const created = await tx.attempt.create({
        data: {
          id: a.attemptId,
          mode: a.mode,
          userId,
          startedAt: new Date(a.startedAt),
          finishedAt: a.finishedAt ? new Date(a.finishedAt) : null,
          expired: a.expired ?? false,
        },
      });
      attemptIdMap.set(a.attemptId, created.id);
      addedAttempts += 1;
    }
  
    // Answers follow the (possibly remapped) attempt ids.
    for (const ans of answers) {
      const attemptId = attemptIdMap.get(ans.attemptId);
      if (attemptId === undefined) continue;
      const existing = await tx.attemptAnswer.findFirst({
        where: { attemptId, questionId: ans.questionId },
      });
      if (existing) continue;
      await tx.attemptAnswer.create({
        data: {
          attemptId,
          questionId: ans.questionId,
          chosen: ans.chosen,
          isCorrect: ans.isCorrect,
          subjectSnapshot: ans.subjectSnapshot ?? questionById.get(ans.questionId)!.subject.name,
          topicSnapshot: ans.topicSnapshot !== undefined
            ? ans.topicSnapshot
            : questionById.get(ans.questionId)!.topic?.name ?? null,
          difficultySnapshot: ans.difficultySnapshot ?? questionById.get(ans.questionId)!.difficulty,
        },
      });
    }
  
    return { addedStats, updatedStats, addedAttempts, skippedDuplicates };
  });
}
