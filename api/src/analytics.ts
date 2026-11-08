// Analytics service: weak-topics report, score history, progress export/import.
// Personal backup only — import validates strictly (Zod), never invents
// questions, and merges stats/attempts without duplicating rows.

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { badRequest } from "./errors.js";

export interface TopicRow {
  subject: string;
  topic: string | null;
  seen: number;
  wrong: number;
  accuracy: number; // 0..1
}

export interface WeakTopicsReport {
  subjects: TopicRow[];
  /** Weakest subject first (lowest accuracy, ties by wrong desc). */
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
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    return b.wrong - a.wrong;
  });
}

export async function getWeakTopics(db: PrismaClient, userId: number): Promise<WeakTopicsReport> {
  const stats = await db.stat.findMany({
    where: { userId, seen: { gt: 0 } },
    include: {
      question: {
        select: { subject: { select: { name: true } }, topic: { select: { name: true } } },
      },
    },
  });

  const bySubject = new Map<string, { seen: number; wrong: number }>();
  const byTopic = new Map<
    string,
    { subject: string; topic: string | null; seen: number; wrong: number }
  >();

  for (const row of stats) {
    const subjName = row.question.subject.name;
    const topicName = row.question.topic?.name ?? null;

    const s = bySubject.get(subjName) ?? { seen: 0, wrong: 0 };
    s.seen += row.seen;
    s.wrong += row.wrong;
    bySubject.set(subjName, s);

    const tKey = `${subjName}|||${topicName ?? "General"}`;
    const t = byTopic.get(tKey) ?? { subject: subjName, topic: topicName, seen: 0, wrong: 0 };
    t.seen += row.seen;
    t.wrong += row.wrong;
    byTopic.set(tKey, t);
  }

  const subjects: TopicRow[] = [...bySubject.entries()].map(([name, v]) => ({
    subject: name,
    topic: null,
    seen: v.seen,
    wrong: v.wrong,
    accuracy: v.seen > 0 ? (v.seen - v.wrong) / v.seen : 0,
  }));
  const topics: TopicRow[] = [...byTopic.entries()].map(([, v]) => ({
    subject: v.subject,
    topic: v.topic,
    seen: v.seen,
    wrong: v.wrong,
    accuracy: v.seen > 0 ? (v.seen - v.wrong) / v.seen : 0,
  }));

  const all = sortWeakest([...subjects, ...topics]);
  return { subjects: sortWeakest(subjects), weakest: all[0] ?? null };
}

export async function getHistory(db: PrismaClient, userId: number): Promise<HistoryItem[]> {
  const attempts = await db.attempt.findMany({
    where: { userId },
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
          select: { attemptId: true, questionId: true, chosen: true, isCorrect: true },
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
    select: { id: true },
  });
  const missing = [...questionIds].filter((id) => !existing.some((q) => q.id === id));
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
      },
    });
  }

  return { addedStats, updatedStats, addedAttempts, skippedDuplicates };
}
