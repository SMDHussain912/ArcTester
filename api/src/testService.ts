// Mock-test engine service: DB access + Phase 2 selection glued together.
import { getLearningConceptsForTopic } from "./intelligence/conceptKnowledge.js";
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
    subjects: z.array(z.string().trim().min(1)).min(1).max(30).optional(),
    topics: z.array(z.string().trim().min(1)).max(100).optional(),
    topicFilters: z.array(z.object({
      subject: z.string().trim().min(1).max(80),
      topic: z.string().trim().min(1).max(80),
    })).max(300).optional(),
    difficulty: z.enum(["any", "easy", "medium", "hard"]).default("any"),
    count: z.number().int().min(1).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "practice" && !(value.subjects?.length || value.subject)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subjects"],
        message: "Select at least one subject for practice mode.",
      });
    }
    if (value.subjects && new Set(value.subjects).size !== value.subjects.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subjects"], message: "Subjects must be unique." });
    }

    if (value.topicFilters?.length) {
      const selectedSubjects = new Set(value.subjects ?? (value.subject ? [value.subject] : []));
      const seenFilters = new Set<string>();
      for (const [index, filter] of value.topicFilters.entries()) {
        if (!selectedSubjects.has(filter.subject)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["topicFilters", index, "subject"],
            message: "Topic filters must belong to a selected subject.",
          });
        }
        const identity = JSON.stringify([filter.subject, filter.topic]);
        if (seenFilters.has(identity)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["topicFilters", index],
            message: "Duplicate topic filters are not allowed.",
          });
        }
        seenFilters.add(identity);
      }
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
  serverNow: string;
  questions: PublicQuestion[];
  warnings: string[];
}

export interface AttemptRow {
  id: number;
  subject: string;
  topic: string | null;
  difficulty: string;
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

async function loadStats(
  db: PrismaClient,
  userId: number,
  questionIds: number[]
): Promise<StatsById> {
  if (questionIds.length === 0) return {};
  const rows = await db.stat.findMany({
    where: { userId, questionId: { in: questionIds } },
  });
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
  userId: number,
  input: z.infer<typeof CreateTestSchema>,
  now: Date = new Date()
): Promise<CreatedTest> {
  const all = await db.question.findMany({
    select: {
      id: true,
      difficulty: true,
      subject: { select: { name: true } },
      topic: { select: { name: true } },
    },
  });
  const candidates: AttemptRow[] = all.map((row) => ({
    id: row.id,
    subject: row.subject.name,
    topic: row.topic?.name ?? null,
    difficulty: row.difficulty,
  }));
  const stats = await loadStats(
    db,
    userId,
    candidates.map((c) => c.id)
  );

  let selected: AttemptRow[];
  let warnings: string[] = [];

  if (input.mode === "mock") {
    const { questions, shortfalls } = selectMockTest(candidates, stats);
    selected = questions;
    warnings = shortfallWarning(shortfalls);
  } else if (input.mode === "practice") {
    const chosenSubjects = input.subjects ?? (input.subject ? [input.subject] : []);
    const topicFilter = new Set(input.topics ?? []);
    const topicsBySubject = new Map<string, Set<string>>();
    for (const item of input.topicFilters ?? []) {
      const topics = topicsBySubject.get(item.subject) ?? new Set<string>();
      topics.add(item.topic);
      topicsBySubject.set(item.subject, topics);
    }
    const pool = candidates.filter((question) => {
      if (!chosenSubjects.includes(question.subject)) return false;
      if (input.difficulty !== "any" && question.difficulty !== input.difficulty) return false;
      const selectedTopicsForSubject = topicsBySubject.get(question.subject);
      if (selectedTopicsForSubject) {
        return selectedTopicsForSubject.size === 0 || (question.topic !== null && selectedTopicsForSubject.has(question.topic));
      }
      return topicFilter.size === 0 || (question.topic !== null && topicFilter.has(question.topic));
    });
    const requested = input.count ?? 20;
    const selectedById = new Set<number>();
    selected = [];
    const subjectPools = chosenSubjects.map((name) => ({ name, pool: pool.filter((question) => question.subject === name) }));
    const baseQuota = Math.floor(requested / chosenSubjects.length);
    const remainderQuota = requested % chosenSubjects.length;
    const requestedBySubject = new Map(chosenSubjects.map((name, index) => [name, baseQuota + (index < remainderQuota ? 1 : 0)]));
    let remaining = requested;
    let active = subjectPools.filter((entry) => entry.pool.length > 0);
    while (remaining > 0 && active.length > 0) {
      const quota = Math.max(1, Math.floor(remaining / active.length));
      let added = 0;
      for (const entry of active) {
        const available = entry.pool.filter((question) => !selectedById.has(question.id));
        const picked = selectQuestions(available, stats, Math.min(quota, available.length, remaining - added));
        for (const question of picked) { selected.push(question); selectedById.add(question.id); }
        added += picked.length;
      }
      if (added === 0) break;
      remaining -= added;
      active = active.filter((entry) => entry.pool.some((question) => !selectedById.has(question.id)));
    }
    warnings = subjectPools.flatMap((entry) => {
      const target = requestedBySubject.get(entry.name) ?? 0;
      const selectedCount = selected.filter((question) => question.subject === entry.name).length;
      return selectedCount < target
        ? [`${entry.name}: requested ${target} questions, but only ${selectedCount} matched the selected topic and difficulty filters.`]
        : [];
    });
    if (selected.length < requested && warnings.length === 0) {
      warnings.push(`Requested ${requested} questions overall, but only ${selected.length} are available across the selected subjects and filters.`);
    }
  } else {
    // "mistakes" only surfaces questions THIS user has got wrong before.
    const wrongIds = new Set(
      (
        await db.stat.findMany({
          where: { userId, seen: { gt: 0 }, wrong: { gt: 0 } },
        })
      ).map((s) => s.questionId)
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

  // Capture the exact question version before creating the attempt. Later bank edits
  // must not change what the student saw or which answer is considered correct.
  const details = await db.question.findMany({
    where: { id: { in: selected.map((question) => question.id) } },
    select: {
      id: true,
      text: true,
      options: true,
      correctIndex: true,
      explanation: true,
      difficulty: true,
      subject: { select: { name: true } },
      topic: { select: { name: true } },
    },
  });
  const byId = new Map(details.map((question) => [question.id, question]));
  if (byId.size !== selected.length) {
    throw conflict("The question bank changed while this test was being created. Please try again.");
  }

  const attempt = await db.$transaction(async (tx) => {
    const created = await tx.attempt.create({
      data: {
        mode: input.mode,
        userId,
        startedAt: now,
        deadline: new Date(now.getTime() + minutesFor(input.mode, selected.length) * 60000),
      },
    });
    await tx.attemptAnswer.createMany({
      data: selected.map((question) => {
        const snapshot = byId.get(question.id)!;
        return {
          attemptId: created.id,
          questionId: question.id,
          chosen: null,
          isCorrect: false,
          subjectSnapshot: snapshot.subject.name,
          topicSnapshot: snapshot.topic?.name ?? null,
          difficultySnapshot: snapshot.difficulty,
          textSnapshot: snapshot.text,
          optionsSnapshot: snapshot.options,
          correctIndexSnapshot: snapshot.correctIndex,
          explanationSnapshot: snapshot.explanation,
        };
      }),
    });
    return created;
  });

  return {
    attemptId: attempt.id,
    mode: input.mode,
    deadline: attempt.deadline ? attempt.deadline.toISOString() : null,
    serverNow: now.toISOString(),
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
  userId: number,
  attemptId: number,
  input: z.infer<typeof SubmitTestSchema>,
  now: Date = new Date()
): Promise<SubmitSummary> {
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, userId },
    include: { answers: { select: { id: true, questionId: true, correctIndexSnapshot: true } } },
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

  const correctById = new Map(attempt.answers.map((answer) => [answer.questionId, answer.correctIndexSnapshot]));
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
    // Claim the attempt inside the same transaction as stat updates. A second
    // concurrent submit sees finishedAt already set and cannot double-count progress.
    const claimed = await tx.attempt.updateMany({
      where: { id: attemptId, userId, finishedAt: null },
      data: { finishedAt: now, expired },
    });
    if (claimed.count !== 1) throw conflict("This test was already submitted.");

    for (const row of rows) {
      await tx.attemptAnswer.updateMany({
        where: { attemptId, questionId: row.questionId },
        data: { chosen: row.chosen, isCorrect: row.isCorrect },
      });
      const prev = await tx.stat.findUnique({
        where: { userId_questionId: { userId, questionId: row.questionId } },
      });
      const next = nextStat(
        prev ? { seen: prev.seen, wrong: prev.wrong, lastSeen: prev.lastSeen } : undefined,
        outcomeOf(row.chosen, correctById.get(row.questionId) ?? 0),
        now
      );
      await tx.stat.upsert({
        where: { userId_questionId: { userId, questionId: row.questionId } },
        update: { seen: next.seen, wrong: next.wrong, lastSeen: next.lastSeen },
        create: {
          userId,
          questionId: row.questionId,
          seen: next.seen,
          wrong: next.wrong,
          lastSeen: next.lastSeen,
        },
      });
    }
  });

  return { attemptId, score, total: memberIds.size, expired };
}

export interface ResultBreakdown {
  subject: string;
  correct: number;
  incorrect: number;
  unanswered: number;
  total: number;
}

export interface ResultQuestion {
  questionId: number;
  subject: string;
  topic: string | null;
  relatedConcepts: { slug: string; title: string }[];
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
  incorrect: number;
  unanswered: number;
  total: number;
  expired: boolean;
  breakdown: ResultBreakdown[];
  questions: ResultQuestion[];
}

/** Full review (answers + explanations) only AFTER submission. */
export async function getResult(
  db: PrismaClient,
  userId: number,
  attemptId: number
): Promise<TestResult> {
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, userId },
    include: { answers: true },
  });
  if (!attempt) throw notFound("Test not found.");
  if (!attempt.finishedAt) throw forbidden("Submit the test before viewing the result.");

  const breakdown = new Map<string, { correct: number; incorrect: number; unanswered: number; total: number }>();
  let score = 0;
  let incorrect = 0;
  let unanswered = 0;
  const questions: ResultQuestion[] = attempt.answers.map((a) => {
    if (a.isCorrect) score += 1;
    else if (a.chosen === null) unanswered += 1;
    else incorrect += 1;
    const subject = a.subjectSnapshot;
    const entry = breakdown.get(subject) ?? { correct: 0, incorrect: 0, unanswered: 0, total: 0 };
    entry.total += 1;
    if (a.isCorrect) entry.correct += 1;
    else if (a.chosen === null) entry.unanswered += 1;
    else entry.incorrect += 1;
    breakdown.set(subject, entry);
    return {
      questionId: a.questionId,
      subject,
      topic: a.topicSnapshot,
      relatedConcepts: getLearningConceptsForTopic(a.topicSnapshot),
      text: a.textSnapshot,
      options: decodeOptions(a.optionsSnapshot),
      selectedIndex: a.chosen,
      correctIndex: a.correctIndexSnapshot,
      isCorrect: a.isCorrect,
      explanation: a.explanationSnapshot,
    };
  });

  return {
    attemptId: attempt.id,
    mode: attempt.mode,
    score,
    incorrect,
    unanswered,
    total: attempt.answers.length,
    expired: attempt.expired,
    breakdown: [...breakdown.entries()].map(([subject, v]) => ({ subject, ...v })),
    questions,
  };
}

export interface AttemptView {
  attemptId: number;
  mode: TestMode;
  deadline: string;
  serverNow: string;
  questions: PublicQuestion[];
  /** Saved selections so a refresh can restore the paper. */
  saved: { questionId: number; selectedIndex: number | null }[];
}

/** In-progress attempt for restore-on-refresh. 404 if missing, 409 if submitted. */
export async function getAttemptView(
  db: PrismaClient,
  userId: number,
  attemptId: number,
  now: Date = new Date()
): Promise<AttemptView> {
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, userId },
    include: { answers: true },
  });
  if (!attempt) throw notFound("Test not found.");
  if (attempt.finishedAt) {
    throw conflict("This test was already submitted. View the result instead.");
  }
  if (!attempt.deadline) throw conflict("This test has no deadline. Please start a new test.");

  return {
    attemptId: attempt.id,
    mode: attempt.mode as TestMode,
    deadline: attempt.deadline.toISOString(),
    serverNow: now.toISOString(),
    questions: attempt.answers.map((answer) =>
      toPublicQuestion({
        id: answer.questionId,
        subject: answer.subjectSnapshot,
        topic: answer.topicSnapshot,
        text: answer.textSnapshot,
        options: answer.optionsSnapshot,
      })
    ),
    saved: attempt.answers.map((a) => ({
      questionId: a.questionId,
      selectedIndex: a.chosen,
    })),
  };
}
