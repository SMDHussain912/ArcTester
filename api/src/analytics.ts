// Analytics service: weak-topics report, score history, progress export/import.
// Personal backup only — import validates strictly (Zod), never invents
// questions, and merges stats/attempts without duplicating rows.

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { badRequest } from "./errors.js";

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
  const attempts = await db.attempt.findMany({
    where: { userId, finishedAt: { not: null } },
    include: {
      answers: {
        include: {
          question: {
            select: {
              subject: { select: { name: true } },
              topic: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  type Counts = { correct: number; wrong: number; unanswered: number };
  const bySubject = new Map<string, Counts>();
  const byTopic = new Map<string, { subject: string; topic: string | null; counts: Counts }>();
  const empty = (): Counts => ({ correct: 0, wrong: 0, unanswered: 0 });

  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      const hasSnapshot = answer.subjectSnapshot.length > 0;
      const subject = hasSnapshot ? answer.subjectSnapshot : answer.question.subject.name;
      const topic = hasSnapshot ? answer.topicSnapshot : answer.question.topic?.name ?? null;
      const outcome = answer.chosen === null ? "unanswered" : answer.isCorrect ? "correct" : "wrong";
      const subjectCounts = bySubject.get(subject) ?? empty();
      subjectCounts[outcome] += 1;
      bySubject.set(subject, subjectCounts);

      const key = JSON.stringify([subject, topic]);
      const topicEntry = byTopic.get(key) ?? { subject, topic, counts: empty() };
      topicEntry.counts[outcome] += 1;
      byTopic.set(key, topicEntry);
    }
  }

  const toRow = (subject: string, topic: string | null, counts: Counts): TopicRow => {
    const seen = counts.correct + counts.wrong;
    return {
      subject,
      topic,
      seen,
      correct: counts.correct,
      wrong: counts.wrong,
      incorrect: counts.wrong,
      unanswered: counts.unanswered,
      accuracy: seen > 0 ? counts.correct / seen : null,
    };
  };

  const subjects = sortWeakest(
    [...bySubject.entries()].map(([name, counts]) => toRow(name, null, counts))
  );
  const topics = sortWeakest([...byTopic.values()].map((entry) =>
    toRow(entry.subject, entry.topic, entry.counts)
  ));
  const candidates = sortWeakest([...subjects, ...topics].filter((row) => row.accuracy !== null));
  return { subjects, topics, weakest: candidates[0] ?? null };
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
  const [attempts, submissions, weakTopics] = await Promise.all([
    db.attempt.findMany({
      where: { userId, finishedAt: { not: null } },
      orderBy: { finishedAt: "asc" },
      include: {
        answers: {
          include: {
            question: {
              select: {
                subject: { select: { name: true } },
                topic: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    db.examSubmission.findMany({
      where: { assignment: { studentId: userId } },
      orderBy: { receivedAt: "asc" },
      include: {
        answers: {
          include: {
            examQuestion: { select: { subject: true, topic: true, marks: true } },
          },
        },
      },
    }),
    getWeakTopics(db, userId),
  ]);

  let practiceCorrect = 0;
  let practiceIncorrect = 0;
  let practiceUnanswered = 0;
  const trend = attempts.slice(-12).map((attempt) => {
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    for (const answer of attempt.answers) {
      if (answer.chosen === null) unanswered += 1;
      else if (answer.isCorrect) correct += 1;
      else incorrect += 1;
    }
    const answered = correct + incorrect;
    return {
      attemptId: attempt.id,
      finishedAt: attempt.finishedAt!.toISOString(),
      accuracy: answered > 0 ? correct / answered : null,
      correct,
      total: attempt.answers.length,
    };
  });

  // Totals include every completed attempt; the trend is intentionally limited to 12.
  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      if (answer.chosen === null) practiceUnanswered += 1;
      else if (answer.isCorrect) practiceCorrect += 1;
      else practiceIncorrect += 1;
    }
  }
  const practiceAnswered = practiceCorrect + practiceIncorrect;

  const graded = submissions.filter((submission) => submission.status === "GRADED");
  const reviewRequired = submissions.filter((submission) => submission.status === "REVIEW_REQUIRED");
  const verifiedAnswers = graded.flatMap((submission) => submission.answers);
  const formalCorrect = verifiedAnswers.filter((answer) => answer.selectedIndex !== null && answer.isCorrect).length;
  const formalIncorrect = verifiedAnswers.filter((answer) => answer.selectedIndex !== null && !answer.isCorrect).length;
  const formalUnanswered = verifiedAnswers.filter((answer) => answer.selectedIndex === null).length;
  const formalScore = graded.reduce((sum, submission) => sum + (submission.score ?? 0), 0);
  const formalMaximum = graded.reduce((sum, submission) => sum + (submission.maximumScore ?? 0), 0);

  const formalBySubject = new Map<string, {
    correct: number; incorrect: number; unanswered: number; awardedMarks: number; maximumMarks: number;
  }>();
  for (const answer of verifiedAnswers) {
    const subject = answer.examQuestion.subject;
    const row = formalBySubject.get(subject) ?? {
      correct: 0, incorrect: 0, unanswered: 0, awardedMarks: 0, maximumMarks: 0,
    };
    if (answer.selectedIndex === null) row.unanswered += 1;
    else if (answer.isCorrect) row.correct += 1;
    else row.incorrect += 1;
    row.awardedMarks += answer.awardedMarks;
    row.maximumMarks += answer.examQuestion.marks;
    formalBySubject.set(subject, row);
  }

  return {
    generatedAt: new Date().toISOString(),
    practice: {
      completedAttempts: attempts.length,
      questions: practiceCorrect + practiceIncorrect + practiceUnanswered,
      correct: practiceCorrect,
      incorrect: practiceIncorrect,
      unanswered: practiceUnanswered,
      accuracy: practiceAnswered > 0 ? practiceCorrect / practiceAnswered : null,
      subjects: weakTopics.subjects,
      trend,
    },
    formalExams: {
      submissions: submissions.length,
      graded: graded.length,
      reviewRequired: reviewRequired.length,
      score: formalScore,
      maximumScore: formalMaximum,
      scorePercentage: formalMaximum > 0 ? (formalScore / formalMaximum) * 100 : null,
      correct: formalCorrect,
      incorrect: formalIncorrect,
      unanswered: formalUnanswered,
      subjects: [...formalBySubject.entries()].map(([subject, row]) => ({
        subject, ...row,
        accuracy: row.correct + row.incorrect > 0
          ? row.correct / (row.correct + row.incorrect)
          : null,
      })).sort((a, b) => (a.accuracy ?? 2) - (b.accuracy ?? 2)),
    },
  };
}

export async function getHistory(db: PrismaClient, userId: number): Promise<HistoryItem[]> {
  const attempts = await db.attempt.findMany({
    where: { userId, finishedAt: { not: null } },
    orderBy: { finishedAt: "desc" },
    include: {
      answers: { select: { isCorrect: true } },
    },
  });
  return attempts.map((a) => {
    const correct = a.answers.filter((x) => x.isCorrect).length;
    return {
      attemptId: a.id,
      mode: a.mode,
      startedAt: a.startedAt.toISOString(),
      finishedAt: a.finishedAt ? a.finishedAt.toISOString() : null,
      score: correct,
      total: a.answers.length,
      expired: a.expired,
    };
  });
}

export interface StudyRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  reason: string;
  subject: string | null;
  topic: string | null;
  mode: "practice" | "mistakes" | "mock";
  questionCount: number;
}

export interface StudyRecommendationsReport {
  generatedAt: string;
  basedOnAttempts: number;
  recommendations: StudyRecommendation[];
}

/**
 * Turns a learner's own attempt statistics into transparent next steps.
 * This is deterministic guidance, not an AI-generated diagnosis.
 */
export async function getStudyRecommendations(
  db: PrismaClient,
  userId: number
): Promise<StudyRecommendationsReport> {
  const [weakTopics, history] = await Promise.all([
    getWeakTopics(db, userId),
    getHistory(db, userId),
  ]);
  const recommendations: StudyRecommendation[] = [];
  const weakestSubject = weakTopics.subjects.find((subject) => subject.accuracy !== null);

  if (weakestSubject) {
    const accuracy = Math.round((weakestSubject.accuracy ?? 0) * 100);
    recommendations.push({
      id: "strengthen-weakest-subject",
      priority: accuracy < 55 ? "high" : "medium",
      title: `Strengthen ${weakestSubject.subject}`,
      reason: `${accuracy}% accuracy across ${weakestSubject.seen} answered questions. Focused practice will help close this gap.`,
      subject: weakestSubject.subject,
      topic: null,
      mode: "practice",
      questionCount: 15,
    });

    if (weakestSubject.wrong > 0) {
      recommendations.push({
        id: "review-mistakes",
        priority: "medium",
        title: "Revisit incorrect answers",
        reason: `You have ${weakestSubject.wrong} incorrect answers in ${weakestSubject.subject}. Review mistakes before taking another timed mock.`,
        subject: weakestSubject.subject,
        topic: null,
        mode: "mistakes",
        questionCount: 10,
      });
    }
  } else if (history.length > 0) {
    recommendations.push({
      id: "build-subject-baseline",
      priority: "medium",
      title: "Build a subject performance baseline",
      reason: "Complete a focused subject session so your next study plan can target the areas that need attention.",
      subject: null,
      topic: null,
      mode: "practice",
      questionCount: 15,
    });
  } else {
    recommendations.push({
      id: "start-diagnostic-practice",
      priority: "low",
      title: "Start with a diagnostic practice session",
      reason: "There is not enough attempt history yet. Complete your first practice session to unlock recommendations based on your results.",
      subject: null,
      topic: null,
      mode: "practice",
      questionCount: 10,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    basedOnAttempts: history.length,
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
  const history = await getHistory(db, userId);
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

const ImportPayloadSchema = z.object({
  exportedAt: z.string().datetime().optional(),
  stats: z.array(ImportStatSchema).optional().default([]),
  attempts: z.array(ImportAttemptSchema).optional().default([]),
  answers: z.array(ImportAnswerSchema).optional().default([]),
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

  // Stats merge into THIS user's rows only.
  let addedStats = 0;
  let updatedStats = 0;
  for (const s of stats) {
    const prev = await db.stat.findUnique({
      where: { userId_questionId: { userId, questionId: s.questionId } },
    });
    if (!prev) {
      await db.stat.create({
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
      await db.stat.update({
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
    const prev = await db.attempt.findUnique({ where: { id: a.attemptId } });
    if (prev) {
      if (prev.userId === userId) {
        // Already imported into this account — keep the original id.
        attemptIdMap.set(a.attemptId, prev.id);
        skippedDuplicates += 1;
        continue;
      }
      // Owned by somebody else: re-import under a new id instead of clobbering.
      const created = await db.attempt.create({
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
    const created = await db.attempt.create({
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
    const existing = await db.attemptAnswer.findFirst({
      where: { attemptId, questionId: ans.questionId },
    });
    if (existing) continue;
    await db.attemptAnswer.create({
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
}
