// Pure selection logic: NO Prisma, NO I/O, NO Math.random hidden inside.
// Callers pass in candidate questions + stats + an injectable random function,
// so tests are deterministic and the core stays unit-testable without a DB.
//
// Order: (1) unseen first, (2) previously-wrong (higher `wrong` first,
// shuffled within equal counts), (3) the rest by oldest `lastSeen`.
// Only groups 1 and 2 are shuffled; group 3 is strictly oldest-first.

import { z } from "zod";

export type RandomFn = () => number;

export interface SelectableQuestion {
  id: number | string;
  subject: string;
}

export interface QuestionStat {
  seen: number;
  wrong: number;
  /** Null/undefined means "never seen" -> sorts as oldest. */
  lastSeen?: Date | string | number | null;
}

export type StatsById = Record<string, QuestionStat | undefined>;

export interface Shortfall {
  subject: string;
  requested: number;
  available: number;
}

const RequestedCountSchema = z.number().int().min(0, "requested count must be 0 or more");

/** Official APECET 2026 CSE unit distribution (APSCHE Annexure-II); aliases preserve existing imported bank labels. Source: https://cets.apsche.ap.gov.in/ECET/PDF/Diploma%20Holders%20in%20Engineering/APECET2026_COMPUTER_SCIENCE_AND_ENGINEERING.pdf */
export const MOCK_QUOTAS: readonly { subject: string; count: number; aliases?: readonly string[] }[] = [
  { subject: "Mathematics", count: 50, aliases: ["Maths"] },
  { subject: "Physics", count: 25 },
  { subject: "Chemistry", count: 25 },
  { subject: "Digital Electronics", count: 6 },
  { subject: "Software Engineering", count: 6 },
  { subject: "Computer Organisation and Microprocessors", count: 8, aliases: ["Computer Organisation", "Computer Organization", "Computer Organization and Microprocessors"] },
  { subject: "Data Structures through C", count: 10, aliases: ["Data Structures"] },
  { subject: "Computer Networks", count: 6, aliases: ["Computer Networks & Cyber Security"] },
  { subject: "Operating Systems", count: 10 },
  { subject: "DBMS", count: 8 },
  { subject: "Java Programming", count: 10, aliases: ["Java"] },
  { subject: "Web Technologies", count: 8 },
  { subject: "Big-data & Cloud Computing", count: 6, aliases: ["Big Data & Cloud", "Big Data & Cloud Computing", "Bid-data & Cloud Computing"] },
  { subject: "Android Programming", count: 6, aliases: ["Android"] },
  { subject: "Internet Of Things(IoT)", count: 8, aliases: ["IoT", "Internet of Things", "Internet of Things (IoT)"] },
  { subject: "Python Programming", count: 8, aliases: ["Python"] },
];

export const MOCK_TOTAL = MOCK_QUOTAS.reduce((sum, q) => sum + q.count, 0); // 200

function statFor(stats: StatsById, id: number | string): QuestionStat | undefined {
  return stats[String(id)];
}

function lastSeenTime(stat: QuestionStat | undefined): number {
  const value = stat?.lastSeen;
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Fisher-Yates shuffle using the injected random source. Pure (no mutation). */
export function shuffleArray<T>(items: readonly T[], random: RandomFn = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Tiny seeded RNG (mulberry32) so practice runs can be reproducible. No deps. */
export function createSeededRandom(seed: number): RandomFn {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick up to `requested` questions: unseen -> wrong (more wrong first) ->
 * oldest-seen. Dedupes by id (keeps first), never returns more than requested.
 */
export function selectQuestions<T extends SelectableQuestion>(
  candidates: readonly T[],
  stats: StatsById = {},
  requested: number,
  random: RandomFn = Math.random
): T[] {
  const count = RequestedCountSchema.parse(requested);
  if (count === 0 || candidates.length === 0) return [];

  const seenIds = new Set<string>();
  const unique: T[] = [];
  for (const q of candidates) {
    const key = String(q.id);
    if (!seenIds.has(key)) {
      seenIds.add(key);
      unique.push(q);
    }
  }

  const unseen: T[] = [];
  const wrong: { q: T; wrong: number }[] = [];
  const rest: T[] = [];
  for (const q of unique) {
    const stat = statFor(stats, q.id);
    if (!stat || stat.seen <= 0) unseen.push(q);
    else if (stat.wrong > 0) wrong.push({ q, wrong: stat.wrong });
    else rest.push(q);
  }

  const shuffledUnseen = shuffleArray(unseen, random);
  const shuffledWrong = shuffleArray(wrong, random).sort((a, b) => b.wrong - a.wrong);
  const oldestFirst = [...rest].sort(
    (a, b) => lastSeenTime(statFor(stats, a.id)) - lastSeenTime(statFor(stats, b.id))
  );

  const ordered = [...shuffledUnseen, ...shuffledWrong.map((w) => w.q), ...oldestFirst];
  return ordered.slice(0, count);
}

export interface MockSelection<T> {
  questions: T[];
  shortfalls: Shortfall[];
}

function normalizeSubjectName(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Per-subject quotas in official paper order; known legacy labels map to the same unit. */
export function selectMockTest<T extends SelectableQuestion>(
  candidates: readonly T[],
  stats: StatsById = {},
  random: RandomFn = Math.random
): MockSelection<T> {
  const questions: T[] = [];
  const shortfalls: Shortfall[] = [];
  for (const quota of MOCK_QUOTAS) {
    const acceptedNames = new Set([quota.subject, ...(quota.aliases ?? [])].map(normalizeSubjectName));
    const pool = candidates.filter((question) => acceptedNames.has(normalizeSubjectName(question.subject)));
    questions.push(...selectQuestions(pool, stats, quota.count, random));
    if (pool.length < quota.count) {
      shortfalls.push({ subject: quota.subject, requested: quota.count, available: pool.length });
    }
  }
  return { questions, shortfalls };
}

export type AnswerOutcome = "correct" | "wrong" | "unanswered";

/** seen +1, lastSeen = now; correct heals (floor 0), wrong/unanswered hurts. */
export function nextStat(
  prev: QuestionStat | undefined,
  outcome: AnswerOutcome,
  now: Date = new Date()
): { seen: number; wrong: number; lastSeen: Date } {
  const seen = (prev?.seen ?? 0) + 1;
  const wrong =
    outcome === "correct" ? Math.max(0, (prev?.wrong ?? 0) - 1) : (prev?.wrong ?? 0) + 1;
  return { seen, wrong, lastSeen: now };
}
