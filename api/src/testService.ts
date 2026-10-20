// Mock-test engine service: DB access + Phase 2 selection glued together.
// Routes stay thin (parse/validate/respond); this file owns the workflow.

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { decodeOptions } from "./questions.js";
import {
  nextStat,
  selectMockTest,
  selectQuestions,
  type AnswerOutcome,
  type QuestionStat,
  type Shortfall,
  type StatsById,
} from "./selection.js";

export const MODES = ["mock", "practice", "mistakes"] as const;
export type TestMode = (typeof MODES)[number];

export const CreateTestSchema = z
  .object({
    mode: z.enum(MODES),
    subject: z.string().trim().min(1).optional(),
    count: z.number().int().min(1).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.mode === "practice" || value.mode === "mistakes") && !value.subject) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subject"],
        message: "subject is required for practice and mistakes modes",
      });
    }
  });

export const SubmitTestSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.number().int().positive(),
        selectedIndex: z.number().int().min(0).max(3).nullable(),
      })
    )
    .min(1, "at least one answer is required")
    .max(200),
});

export interface PublicQuestion {
  id: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string[];
}

export interface CreatedTest {
  attemptId: number;
  mode: TestMode;
  deadline: string | null;
  questions: PublicQuestion[];
  warnings: string[];
}

export interface AttemptRow {
  id: number;
  subject: string;
}

export interface SubmitSummary {
  attemptId: number;
  score: number;
  total: number;
  expired: boolean;
}

const MOCK_MINUTES = 180;
const MINUTES_PER_QUESTION = 0.9;

function minutesFor(mode: TestMode, questionCount: number): number {
  if (mode === "mock") return MOCK_MINUTES;
  return Math.max(5, Math.round(questionCount * MINUTES_PER_QUESTION));
}

function shortfallWarning(shortfalls: Shortfall[]): string[] {
  return shortfalls.map(
    (s) =>
      `${s.subject}: only ${s.available} of ${s.requested} questions available. ` +
      `The test uses what exists.`
  );
}

function toPublicQuestion(row: {
  id: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string;
}): PublicQuestion {
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    text: row.text,
    options: decodeOptions(row.options),
  };
}

async function loadStats(db: PrismaClient, questionIds: number[]): Promise<StatsById> {
  if (questionIds.length === 0) return {};
  const rows = await db.stat.findMany({ where: { questionId: { in: questionIds } } });
  const stats: StatsById = {};
  for (const row of rows) {
    const stat: QuestionStat = { seen: row.seen, wrong: row.wrong };
    if (row.lastSeen) stat.lastSeen = row.lastSeen;
    stats[String(row.questionId)] = stat;
  }
  return stats;
}

function outcomeOf(selectedIndex: number | null, correctIndex: number): AnswerOutcome {
  if (selectedIndex === null) return "unanswered";
  return selectedIndex === correctIndex ? "correct" : "wrong";
}

/** Build a test, persist the Attempt + its question links, return sanitized set. */
export async function createTest(
  db: PrismaClient,
  input: z.infer<typeof CreateTestSchema>,
  now: Date = new Date()
): Promise<CreatedTest> {
  const all = await db.question.findMany({
    select: { id: true, subject: { select: { name: true } } },
  });
  const candidates: AttemptRow[] = all.map((row) => ({ id: row.id, subject: row.subject.name }));
  const stats = await loadStats(
    db,
    candidates.map((c) => c.id)
  );

  let selected: AttemptRow[];
  let warnings: string[] = [];

  if (input.mode === "mock") {
    const { questions, shortfalls } = selectMockTest(candidates, stats);
    selected = questions;
    warnings = shortfallWarning(shortfalls);
  } else if (input.mode === "practice") {
    const pool = candidates.filter((c) => c.subject === input.subject);
    const count = input.count ?? 20;
    selected = selectQuestions(pool, stats, count);
    if (pool.length < count) {
      warnings = shortfallWarning([
        { subject: input.subject as string, requested: count, available: pool.length },
      ]);
    }
  } else {
    const wrongIds = new Set(
      (await db.stat.findMany({ where: { seen: { gt: 0 }, wrong: { gt: 0 } } })).map(
        (s) => s.questionId
      )
    );
    let pool = candidates.filter((c) => wrongIds.has(c.id));
    if (input.subject) pool = pool.filter((c) => c.subject === input.subject);
    const count = input.count ?? 30;
    selected = selectQuestions(pool, stats, count);
    if (pool.length < count) {
      warnings = shortfallWarning([
        { subject: input.subject ?? "mistakes", requested: count, available: pool.length },
      ]);
    }
  }

  if (selected.length === 0) throw badRequest("No questions available for this choice yet.");

  const attempt = await db.$transaction(async (tx) => {
    const created = await tx.attempt.create({
      data: {
        mode: input.mode,
        startedAt: now,
        deadline: new Date(now.getTime() + minutesFor(input.mode, selected.length) * 60000),
      },
    });
    await tx.attemptAnswer.createMany({
      data: selected.map((question) => ({
        attemptId: created.id,
        questionId: question.id,
        chosen: null,
        isCorrect: false,
      })),
    });
    return created;
  });

  const details = await db.question.findMany({
    where: { id: { in: selected.map((s) => s.id) } },
    select: {
      id: true,
      text: true,
      options: true,
      subject: { select: { name: true } },
      topic: { select: { name: true } },
    },
  });
  const byId = new Map(details.map((d) => [d.id, d]));

  return {
    attemptId: attempt.id,
    mode: input.mode,
    deadline: attempt.deadline ? attempt.deadline.toISOString() : null,
    questions: selected
      .map((s) => byId.get(s.id))
      .filter((d) => d !== undefined)
      .map((d) =>
        toPublicQuestion({
          id: d.id,
          subject: d.subject.name,
          topic: d.topic?.name ?? null,
          text: d.text,
          options: d.options,
        })
      ),
    warnings,
  };
}

/** Score server-side, persist answers + stats in ONE transaction. */
export async function submitTest(
  db: PrismaClient,
  attemptId: number,
  input: z.infer<typeof SubmitTestSchema>,
  now: Date = new Date()
): Promise<SubmitSummary> {
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    include: { answers: { select: { id: true, questionId: true } } },
  });
  if (!attempt) throw notFound("Test not found.");
  if (attempt.finishedAt) throw conflict("This test was already submitted.");

  const memberIds = new Set(attempt.answers.map((a) => a.questionId));
  const seen = new Set<number>();
  for (const answer of input.answers) {
    if (seen.has(answer.questionId)) throw badRequest("Duplicate answer for a question.");
    seen.add(answer.questionId);
    if (!memberIds.has(answer.questionId)) {
      throw badRequest("An answer is for a question not in this test.");
    }
  }

  const questions = await db.question.findMany({
    where: { id: { in: [...memberIds] } },
    select: { id: true, correctIndex: true },
  });
  const correctById = new Map(questions.map((row) => [row.id, row.correctIndex]));
  const chosenById = new Map(input.answers.map((a) => [a.questionId, a.selectedIndex]));

  let score = 0;
  const rows = [...memberIds].map((questionId) => {
    const chosen = chosenById.has(questionId)
      ? (chosenById.get(questionId) as number | null)
      : null;
    const correct = chosen !== null && chosen === correctById.get(questionId);
    if (correct) score += 1;
    return { questionId, chosen, isCorrect: correct };
  });

  const expired = attempt.deadline ? now.getTime() > attempt.deadline.getTime() : false;

  await db.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.attemptAnswer.updateMany({
        where: { attemptId, questionId: row.questionId },
        data: { chosen: row.chosen, isCorrect: row.isCorrect },
      });
      const prev = await tx.stat.findUnique({ where: { questionId: row.questionId } });
      const next = nextStat(
        prev ? { seen: prev.seen, wrong: prev.wrong, lastSeen: prev.lastSeen } : undefined,
        outcomeOf(row.chosen, correctById.get(row.questionId) ?? 0),
        now
      );
      await tx.stat.upsert({
        where: { questionId: row.questionId },
        update: { seen: next.seen, wrong: next.wrong, lastSeen: next.lastSeen },
        create: {
          questionId: row.questionId,
          seen: next.seen,
          wrong: next.wrong,
          lastSeen: next.lastSeen,
        },
      });
    }
    await tx.attempt.update({
      where: { id: attemptId },
      data: { finishedAt: now, expired },
    });
  });

  return { attemptId, score, total: memberIds.size, expired };
}

export interface ResultBreakdown {
  subject: string;
  correct: number;
  total: number;
}

export interface ResultQuestion {
  questionId: number;
  subject: string;
  text: string;
  options: string[];
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
}

export interface TestResult {
  attemptId: number;
  mode: string;
  score: number;
  total: number;
  expired: boolean;
  breakdown: ResultBreakdown[];
  questions: ResultQuestion[];
}

/** Full review (answers + explanations) only AFTER submission. */
export async function getResult(db: PrismaClient, attemptId: number): Promise<TestResult> {
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: {
        include: {
          question: {
            select: {
              id: true,
              text: true,
              options: true,
              correctIndex: true,
              explanation: true,
              subject: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!attempt) throw notFound("Test not found.");
  if (!attempt.finishedAt) throw forbidden("Submit the test before viewing the result.");

  const breakdown = new Map<string, { correct: number; total: number }>();
  let score = 0;
  const questions: ResultQuestion[] = attempt.answers.map((a) => {
    if (a.isCorrect) score += 1;
    const entry = breakdown.get(a.question.subject.name) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (a.isCorrect) entry.correct += 1;
    breakdown.set(a.question.subject.name, entry);
    return {
      questionId: a.question.id,
      subject: a.question.subject.name,
      text: a.question.text,
      options: decodeOptions(a.question.options),
      selectedIndex: a.chosen,
      correctIndex: a.question.correctIndex,
      isCorrect: a.isCorrect,
      explanation: a.question.explanation,
    };
  });

  return {
    attemptId: attempt.id,
    mode: attempt.mode,
    score,
    total: attempt.answers.length,
    expired: attempt.expired,
    breakdown: [...breakdown.entries()].map(([subject, v]) => ({ subject, ...v })),
    questions,
  };
}
