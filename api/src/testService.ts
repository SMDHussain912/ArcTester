// Mock-test engine service: DB access + Phase 2 selection glued together.
import { getLearningConceptsForTopic } from "./intelligence/conceptKnowledge.js";
import { dailyChallengeQuestionIds, utcDayKey } from "./dailyChallenge.js";
// Routes stay thin (parse/validate/respond); this file owns the workflow.

import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import { decodeOptions } from "./questions.js";
import { gradeQuestion, normalizeResponse, type QuestionType } from "./questionTypes.js";
import {
  nextStat,
  MOCK_TOTAL,
  selectMockTest,
  selectQuestions,
  type QuestionStat,
  type Shortfall,
  type StatsById,
} from "./selection.js";

export const MODES = ["mock", "practice", "speedRound", "mistakes", "dailyChallenge"] as const;
export type TestMode = (typeof MODES)[number];

export const CreateTestSchema = z
  .object({
    mode: z.enum(MODES),
    subject: z.string().trim().min(1).optional(),
    subjects: z.array(z.string().trim().min(1)).min(1).max(30).optional(),
    topics: z.array(z.string().trim().min(1)).max(100).optional(),
    topicFilters: z.array(z.object({
      subject: z.string().trim().min(1).max(80),
      topic: z.string().trim().min(1).max(100),
    })).max(300).optional(),
    difficulty: z.enum(["any", "easy", "medium", "hard"]).default("any"),
    count: z.number().int().min(1).max(200).optional(),
    durationMinutes: z.number().int().min(5).max(180).optional(),
    questionTypes: z.array(z.enum(["mcq", "multi_select", "true_false", "fill_blank", "numeric", "matching"])).max(6).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.mode === "practice" || value.mode === "speedRound") && !(value.subjects?.length || value.subject)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subjects"],
        message: "Select at least one subject for practice mode.",
      });
    }
    if (value.mode === "dailyChallenge" && (value.count ?? 10) > 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["count"], message: "Daily challenges are limited to 10 questions." });
    }
    if (value.mode === "speedRound" && (value.count ?? 10) > 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["count"], message: "Speed rounds are limited to 10 questions." });
    }
    if (value.questionTypes && new Set(value.questionTypes).size !== value.questionTypes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["questionTypes"], message: "Question types must be unique." });
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
        selectedIndex: z.number().int().min(0).max(3).nullable().optional(),
        response: z.unknown().optional(),
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
  questionType: QuestionType;
  promptData: Record<string, unknown>;
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
  questionType?: string;
}

export interface SubmitSummary {
  attemptId: number;
  score: number;
  total: number;
  expired: boolean;
}

const MOCK_MINUTES = 180;
const MINUTES_PER_QUESTION = 0.9;

export function minutesFor(mode: TestMode, questionCount: number, durationMinutes?: number): number {
  if (mode === "mock") return MOCK_MINUTES;
  if (mode === "speedRound") return 5;
  if (mode === "dailyChallenge") return 10;
  if (durationMinutes !== undefined) return Math.max(5, Math.min(180, Math.floor(durationMinutes)));
  return Math.max(5, Math.round(questionCount * MINUTES_PER_QUESTION));
}

/** Full AP ECET mock attempts must match the complete official blueprint.
 * Returning a message (rather than creating a partial attempt) keeps shortage
 * handling deterministic and straightforward to unit-test. */
function shortfallWarning(shortfalls: Shortfall[]): string[] {
  return shortfalls.map(
    (item) =>
      `${item.subject}: only ${item.available} of ${item.requested} questions available. ` +
      `The test uses what exists.`
  );
}

export function selectEcetMockCandidates<T extends { questionType: string }>(candidates: readonly T[]): T[] {
  return candidates.filter((question) => question.questionType === "mcq");
}

export function fullMockReadinessIssue(selectedCount: number, shortfalls: Shortfall[]): string | null {
  if (selectedCount === MOCK_TOTAL && shortfalls.length === 0) return null;
  const details = shortfalls.length
    ? shortfalls.map((item) => item.subject + ': ' + item.available + '/' + item.requested).join('; ')
    : selectedCount + '/' + MOCK_TOTAL + ' questions selected';
  return 'A full AP ECET mock requires all ' + MOCK_TOTAL + ' questions. Your approved question bank is short: ' + details + '. Add and approve the missing questions, then try again.';
}

function toPublicQuestion(row: {
  id: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string;
  questionType: string;
  promptData: string;
}): PublicQuestion {
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    text: row.text,
    options: decodeOptions(row.options),
    questionType: row.questionType as QuestionType,
    promptData: JSON.parse(row.promptData) as Record<string, unknown>,
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

/** Build a test, persist the Attempt + its question links, return sanitized set. */
export async function createTest(
  db: PrismaClient,
  userId: number,
  input: z.infer<typeof CreateTestSchema>,
  now: Date = new Date()
): Promise<CreatedTest> {
  const all = await db.question.findMany({
    where: { reviewStatus: "APPROVED" },
    select: {
      id: true,
      difficulty: true,
      questionType: true,
      subject: { select: { name: true } },
      topic: { select: { name: true } },
    },
  });
  const candidates: AttemptRow[] = all.map((row) => ({
    id: row.id,
    subject: row.subject.name,
    topic: row.topic?.name ?? null,
    difficulty: row.difficulty,
    questionType: row.questionType,
  }));
  // Keep student-created practice papers distinct from published exam papers.
  // A question can still be reused when the practice-only pool is exhausted.
  let practiceCandidates = candidates;
  let reusedExamPool = false;
  if (input.mode === "practice" || input.mode === "speedRound" || input.mode === "dailyChallenge") {
    const publishedExamQuestions = await db.examVersionQuestion.findMany({
      where: {
        sourceQuestionId: { not: null },
        examVersion: { is: { publishedAt: { not: null } } },
      },
      select: { sourceQuestionId: true },
    });
    const examQuestionIds = new Set(
      publishedExamQuestions.flatMap((row) => row.sourceQuestionId === null ? [] : [row.sourceQuestionId]),
    );
    const practiceOnly = candidates.filter((question) => !examQuestionIds.has(question.id));
    if (practiceOnly.length > 0) practiceCandidates = practiceOnly;
    else if (examQuestionIds.size > 0) reusedExamPool = true;
  }
  const stats = await loadStats(
    db,
    userId,
    candidates.map((c) => c.id)
  );

  let selected: AttemptRow[];
  let warnings: string[] = [];

  if (input.mode === "mock") {
    const { questions, shortfalls } = selectMockTest(selectEcetMockCandidates(candidates), stats);
    const readinessIssue = fullMockReadinessIssue(questions.length, shortfalls);
    if (readinessIssue) throw badRequest(readinessIssue);
    selected = questions;
    warnings = [];
  } else if (input.mode === "practice" || input.mode === "speedRound") {
    const chosenSubjects = input.subjects ?? (input.subject ? [input.subject] : []);
    const topicFilter = new Set(input.topics ?? []);
    const topicsBySubject = new Map<string, Set<string>>();
    for (const item of input.topicFilters ?? []) {
      const topics = topicsBySubject.get(item.subject) ?? new Set<string>();
      topics.add(item.topic);
      topicsBySubject.set(item.subject, topics);
    }
    const matchesPracticeFilters = (question: AttemptRow, subject: string): boolean => {
      if (question.subject !== subject) return false;
      if (input.difficulty !== "any" && question.difficulty !== input.difficulty) return false;
      if (input.questionTypes?.length && !input.questionTypes.includes(question.questionType as "mcq" | "multi_select" | "true_false" | "fill_blank" | "numeric" | "matching")) return false;
      const selectedTopicsForSubject = topicsBySubject.get(subject);
      if (selectedTopicsForSubject) {
        return selectedTopicsForSubject.size === 0 || (question.topic !== null && selectedTopicsForSubject.has(question.topic));
      }
      return topicFilter.size === 0 || (question.topic !== null && topicFilter.has(question.topic));
    };
    const requested = input.mode === "speedRound" ? Math.min(input.count ?? 10, 10) : input.count ?? 20;
    const baseQuota = Math.floor(requested / chosenSubjects.length);
    const remainderQuota = requested % chosenSubjects.length;
    const requestedBySubject = new Map(chosenSubjects.map((name, index) => [name, baseQuota + (index < remainderQuota ? 1 : 0)]));
    const pool = chosenSubjects.flatMap((subject) => {
      const practiceOnly = practiceCandidates.filter((question) => matchesPracticeFilters(question, subject));
      const target = requestedBySubject.get(subject) ?? 0;
      if (practiceOnly.length >= target) return practiceOnly;
      // Top up from the exam pool only when the dedicated practice pool cannot
      // satisfy this subject's requested quota.
      const practiceIds = new Set(practiceOnly.map((question) => question.id));
      const overlapFallback = candidates.filter((question) =>
        !practiceIds.has(question.id) && matchesPracticeFilters(question, subject),
      );
      if (overlapFallback.length > 0) reusedExamPool = true;
      return [...practiceOnly, ...overlapFallback];
    });
    const selectedById = new Set<number>();
    selected = [];
    const subjectPools = chosenSubjects.map((name) => ({ name, pool: pool.filter((question) => question.subject === name) }));
    let remaining = requested;
    let active = subjectPools.filter((entry) => entry.pool.length > 0);
    while (remaining > 0 && active.length > 0) {
      const quota = Math.max(1, Math.floor(remaining / active.length));
      let added = 0;
      for (const entry of active) {
        const available = entry.pool.filter((question) => !selectedById.has(question.id));
        const target = Math.min(quota, available.length, remaining - added);
        // Simple topic-level revision: prioritize the topic with the weakest
        // historical accuracy, then its total missed answers. This is rule-based
        // and deliberately does not depend on an ML model or persisted model log.
        const topicPerformance = new Map<string, { seen: number; wrong: number }>();
        for (const question of available) {
          const stat = stats[String(question.id)];
          if (!stat || stat.seen <= 0) continue;
          const topic = question.topic ?? "General";
          const aggregate = topicPerformance.get(topic) ?? { seen: 0, wrong: 0 };
          aggregate.seen += stat.seen;
          aggregate.wrong += stat.wrong;
          topicPerformance.set(topic, aggregate);
        }
        const missed = available.filter((question) => (stats[String(question.id)]?.wrong ?? 0) > 0);
        const missedPicked = [...missed].sort((a, b) => {
          const aTopic = topicPerformance.get(a.topic ?? "General") ?? { seen: 0, wrong: 0 };
          const bTopic = topicPerformance.get(b.topic ?? "General") ?? { seen: 0, wrong: 0 };
          const aAccuracy = aTopic.seen ? aTopic.wrong / aTopic.seen : 0;
          const bAccuracy = bTopic.seen ? bTopic.wrong / bTopic.seen : 0;
          return bAccuracy - aAccuracy
            || bTopic.wrong - aTopic.wrong
            || (stats[String(b.id)]?.wrong ?? 0) - (stats[String(a.id)]?.wrong ?? 0)
            || a.id - b.id;
        }).slice(0, target);
        const pickedIds = new Set(missedPicked.map((question) => question.id));
        const picked = [
          ...missedPicked,
          ...selectQuestions(available.filter((question) => !pickedIds.has(question.id)), stats, target - missedPicked.length),
        ];
        for (const question of picked) {
          selected.push(question);
          selectedById.add(question.id);
        }
        added += picked.length;
      }
      if (added === 0) break;
      remaining -= added;
      active = active.filter((entry) => entry.pool.some((question) => !selectedById.has(question.id)));
    }
    warnings = reusedExamPool
      ? ["The question bank is currently used by published exams, so some exam questions may also appear in this practice paper."]
      : [];
    warnings.push(...subjectPools.flatMap((entry) => {
      const target = requestedBySubject.get(entry.name) ?? 0;
      const selectedCount = selected.filter((question) => question.subject === entry.name).length;
      return selectedCount < target
        ? [`${entry.name}: requested ${target} questions, but only ${selectedCount} matched the selected topic and difficulty filters.`]
        : [];
    }));
    if (selected.length < requested && warnings.length === 0) {
      warnings.push(`Requested ${requested} questions overall, but only ${selected.length} are available across the selected subjects and filters.`);
    }
  } else if (input.mode === "mistakes") {
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
  } else {
    // UTC date seed makes the approved question set identical for all students that day.
    const count = Math.min(input.count ?? 10, 10);
    const challengePool = practiceCandidates.length > 0 ? practiceCandidates : candidates;
    const ids = dailyChallengeQuestionIds(challengePool.map((question) => question.id), utcDayKey(now), count);
    const byId = new Map(challengePool.map((question) => [question.id, question]));
    selected = ids.map((id) => byId.get(id)).filter((question): question is AttemptRow => question !== undefined);
    if (selected.length < count) {
      warnings = [`Daily challenge: only ${selected.length} approved questions are available; the challenge uses the available questions.`];
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
      questionType: true,
      promptData: true,
      answerData: true,
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
        deadline: new Date(now.getTime() + minutesFor(input.mode, selected.length, input.durationMinutes) * 60000),
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
          questionTypeSnapshot: snapshot.questionType,
          promptDataSnapshot: snapshot.promptData,
          answerDataSnapshot: snapshot.answerData,
          responseSnapshot: "null",
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
          questionType: d.questionType,
          promptData: d.promptData,
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
    include: { answers: { select: { id: true, questionId: true, correctIndexSnapshot: true, questionTypeSnapshot: true, answerDataSnapshot: true } } },
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

  const answerById = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
  const responseById = new Map(input.answers.map((a) => [a.questionId, normalizeResponse(a.response !== undefined ? a.response : a.selectedIndex ?? null)]));

  let score = 0;
  const rows = [...memberIds].map((questionId) => {
    const response = responseById.has(questionId) ? responseById.get(questionId) : null;
    const snapshot = answerById.get(questionId)!;
    const chosen = typeof response === "number" ? response : null;
    const correct = gradeQuestion(snapshot.questionTypeSnapshot as QuestionType, snapshot.correctIndexSnapshot, JSON.parse(snapshot.answerDataSnapshot), response);
    if (correct) score += 1;
    return { questionId, chosen, response, isCorrect: correct };
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

    if (rows.length > 0) {
      // Persist all submitted answers in one statement instead of 200 individual updates.
      const answerValues = rows.map((row) => Prisma.sql`(
        ${row.questionId}::int,
        ${row.chosen}::int,
        ${row.isCorrect}::boolean,
        ${JSON.stringify(row.response)}::text
      )`);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "AttemptAnswer" AS aa
        SET "chosen" = v."chosen",
            "isCorrect" = v."isCorrect",
            "responseSnapshot" = v."responseSnapshot"
        FROM (VALUES ${Prisma.join(answerValues)}) AS v("questionId", "chosen", "isCorrect", "responseSnapshot")
        WHERE aa."attemptId" = ${attemptId}
          AND aa."questionId" = v."questionId"
      `);

      // Load the previous mastery stats once, then batch the upserts.
      const previousStats = await tx.stat.findMany({
        where: { userId, questionId: { in: rows.map((row) => row.questionId) } },
        select: { questionId: true, seen: true, wrong: true, lastSeen: true },
      });
      const previousByQuestion = new Map(previousStats.map((stat) => [stat.questionId, stat]));
      const nextStats = rows.map((row) => {
        const previous = previousByQuestion.get(row.questionId);
        return {
          questionId: row.questionId,
          ...nextStat(
            previous ? { seen: previous.seen, wrong: previous.wrong, lastSeen: previous.lastSeen } : undefined,
            row.isCorrect ? "correct" : row.response === null ? "unanswered" : "wrong",
            now,
          ),
        };
      });
      const statValues = nextStats.map((stat) => Prisma.sql`(
        ${userId}::int,
        ${stat.questionId}::int,
        ${stat.seen}::int,
        ${stat.wrong}::int,
        ${stat.lastSeen}::timestamp
      )`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "Stat" ("userId", "questionId", "seen", "wrong", "lastSeen")
        VALUES ${Prisma.join(statValues)}
        ON CONFLICT ("userId", "questionId") DO UPDATE
        SET "seen" = EXCLUDED."seen",
            "wrong" = EXCLUDED."wrong",
            "lastSeen" = EXCLUDED."lastSeen"
      `);
    }

  });

  return { attemptId, score, total: memberIds.size, expired };
}

/** Persist a practice answer snapshot without grading it; replaying is idempotent. */
export async function saveTestAnswers(
  db: PrismaClient, userId: number, attemptId: number, input: z.infer<typeof SubmitTestSchema>,
): Promise<{ attemptId: number; saved: number; serverNow: string }> {
  const seen = new Set<number>();
  for (const answer of input.answers) {
    if (seen.has(answer.questionId)) throw badRequest("Duplicate answer for a question.");
    seen.add(answer.questionId);
  }
  await db.$transaction(async (tx) => {
    const attempt = await tx.attempt.findFirst({
      where: { id: attemptId, userId },
      select: { id: true, finishedAt: true, answers: { select: { questionId: true } } },
    });
    if (!attempt) throw notFound("Test not found.");
    if (attempt.finishedAt) throw conflict("This test was already submitted.");
    const memberIds = new Set(attempt.answers.map((answer) => answer.questionId));
    for (const answer of input.answers) {
      if (!memberIds.has(answer.questionId)) throw badRequest("An answer is for a question not in this test.");
    }
    for (const answer of input.answers) {
      await tx.attemptAnswer.updateMany({
        where: { attemptId, questionId: answer.questionId },
        data: { chosen: answer.selectedIndex ?? (typeof answer.response === "number" ? answer.response : null), responseSnapshot: JSON.stringify(normalizeResponse(answer.response !== undefined ? answer.response : answer.selectedIndex ?? null)) },
      });
    }
  });
  return { attemptId, saved: input.answers.length, serverNow: new Date().toISOString() };
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
  questionType: QuestionType;
  promptData: Record<string, unknown>;
  answerData: Record<string, unknown>;
  response: unknown;
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
    else if (JSON.parse(a.responseSnapshot) === null && a.chosen === null) unanswered += 1;
    else incorrect += 1;
    const subject = a.subjectSnapshot;
    const entry = breakdown.get(subject) ?? { correct: 0, incorrect: 0, unanswered: 0, total: 0 };
    entry.total += 1;
    if (a.isCorrect) entry.correct += 1;
    else if (JSON.parse(a.responseSnapshot) === null && a.chosen === null) entry.unanswered += 1;
    else entry.incorrect += 1;
    breakdown.set(subject, entry);
    return {
      questionId: a.questionId,
      subject,
      topic: a.topicSnapshot,
      relatedConcepts: getLearningConceptsForTopic(a.topicSnapshot),
      text: a.textSnapshot,
      options: decodeOptions(a.optionsSnapshot),
      questionType: a.questionTypeSnapshot as QuestionType,
      promptData: JSON.parse(a.promptDataSnapshot) as Record<string, unknown>,
      answerData: JSON.parse(a.answerDataSnapshot) as Record<string, unknown>,
      response: JSON.parse(a.responseSnapshot) ?? a.chosen,
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
  saved: { questionId: number; selectedIndex: number | null; response: unknown }[];
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
        questionType: answer.questionTypeSnapshot,
        promptData: answer.promptDataSnapshot,
      })
    ),
    saved: attempt.answers.map((a) => ({
      questionId: a.questionId,
      selectedIndex: a.chosen,
      response: JSON.parse(a.responseSnapshot),
    })),
  };
}
