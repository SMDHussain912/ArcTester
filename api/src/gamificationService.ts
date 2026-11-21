import type { Prisma, PrismaClient } from "@prisma/client";

export type RewardKind = "lesson" | "unit-test" | "practice";
export const REWARD_XP: Record<RewardKind, number> = { lesson: 20, "unit-test": 50, practice: 10 };
const DAILY_GOAL_BONUS = 10;
const FREEZE_COST_XP = 100;
const MAX_FREEZES = 2;

function utcDay(value = new Date()): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
function dayDifference(a: Date, b: Date): number {
  return Math.round((utcDay(a).getTime() - utcDay(b).getTime()) / 86_400_000);
}
export function levelForXp(totalXp: number): { level: number; xpIntoLevel: number; xpToNextLevel: number } {
  const level = Math.floor(Math.max(0, totalXp) / 100) + 1;
  const xpIntoLevel = Math.max(0, totalXp) % 100;
  return { level, xpIntoLevel, xpToNextLevel: 100 - xpIntoLevel };
}
type Tx = Prisma.TransactionClient;
type RewardResult = { awarded: boolean; xpAwarded: number; goalBonus: number; totalXp: number; level: number; currentStreak: number; dailyXp: number; dailyGoalXp: number; goalReached: boolean };

export async function awardXp(
  tx: Tx,
  userId: number,
  eventKey: string,
  kind: RewardKind,
  now = new Date(),
): Promise<RewardResult> {
  const day = utcDay(now);
  const state = await tx.userGamification.upsert({
    where: { userId }, create: { userId }, update: {},
  });
  const inserted = await tx.xpLedger.createMany({
    data: [{ userId, eventKey, amount: REWARD_XP[kind], reason: kind }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) {
    const today = await tx.gamificationDay.findUnique({ where: { userId_date: { userId, date: day } } });
    return { awarded: false, xpAwarded: 0, goalBonus: 0, totalXp: state.totalXp, level: levelForXp(state.totalXp).level,
      currentStreak: state.currentStreak, dailyXp: today?.xpEarned ?? 0, dailyGoalXp: state.dailyGoalXp, goalReached: Boolean(today?.goalReachedAt) };
  }

  let currentStreak = state.currentStreak;
  let longestStreak = state.longestStreak;
  let freezeInventory = state.streakFreezeInventory;
  if (!state.lastActivityDate) {
    currentStreak = 1;
  } else {
    const gap = dayDifference(day, state.lastActivityDate);
    if (gap === 0) {
      // Multiple learning actions in one UTC day count as one streak day.
    } else if (gap === 1) {
      currentStreak = Math.max(1, currentStreak + 1);
    } else if (gap === 2 && freezeInventory > 0) {
      currentStreak = Math.max(1, currentStreak + 1);
      freezeInventory -= 1;
      const missedDay = new Date(day.getTime() - 86_400_000);
      await tx.gamificationDay.upsert({
        where: { userId_date: { userId, date: missedDay } },
        create: { userId, date: missedDay, freezeUsed: true },
        update: { freezeUsed: true },
      });
    } else {
      currentStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, currentStreak);
  const updateState = await tx.userGamification.update({
    where: { userId },
    data: { totalXp: { increment: REWARD_XP[kind] }, xpBalance: { increment: REWARD_XP[kind] }, currentStreak, longestStreak, lastActivityDate: day, streakFreezeInventory: freezeInventory },
  });
  const dailyCreate = {
    userId, date: day, xpEarned: REWARD_XP[kind],
    lessonsCompleted: kind === "lesson" ? 1 : 0,
    unitTestsPassed: kind === "unit-test" ? 1 : 0,
    practiceTestsDone: kind === "practice" ? 1 : 0,
  };
  const dailyUpdate = {
    xpEarned: { increment: REWARD_XP[kind] },
    lessonsCompleted: kind === "lesson" ? { increment: 1 } : undefined,
    unitTestsPassed: kind === "unit-test" ? { increment: 1 } : undefined,
    practiceTestsDone: kind === "practice" ? { increment: 1 } : undefined,
  };
  const daily = await tx.gamificationDay.upsert({
    where: { userId_date: { userId, date: day } },
    create: dailyCreate,
    update: dailyUpdate,
  });
  let goalBonus = 0;
  let goalReachedAt = daily.goalReachedAt;
  if (!goalReachedAt && daily.xpEarned >= state.dailyGoalXp) {
    const bonusEvent = await tx.xpLedger.createMany({
      data: [{ userId, eventKey: eventKey + ":daily-goal-bonus", amount: DAILY_GOAL_BONUS, reason: "daily-goal-bonus" }],
      skipDuplicates: true,
    });
    if (bonusEvent.count) {
      goalBonus = DAILY_GOAL_BONUS;
      goalReachedAt = now;
      await tx.userGamification.update({ where: { userId }, data: { totalXp: { increment: goalBonus }, xpBalance: { increment: goalBonus } } });
      await tx.gamificationDay.update({ where: { userId_date: { userId, date: day } }, data: { xpEarned: { increment: goalBonus }, goalReachedAt } });
    }
  }
  const totalXp = updateState.totalXp + goalBonus;
  return { awarded: true, xpAwarded: REWARD_XP[kind], goalBonus, totalXp, level: levelForXp(totalXp).level,
    currentStreak, dailyXp: daily.xpEarned + goalBonus, dailyGoalXp: state.dailyGoalXp, goalReached: Boolean(goalReachedAt) };
}

export async function gamificationSnapshot(db: PrismaClient, userId: number, now = new Date()) {
  const today = utcDay(now);
  const [state, days, recentEvents] = await Promise.all([
    db.userGamification.upsert({ where: { userId }, create: { userId }, update: {} }),
    db.gamificationDay.findMany({ where: { userId, date: { gte: new Date(today.getTime() - 6 * 86_400_000), lte: today } }, orderBy: { date: "asc" } }),
    db.xpLedger.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, select: { amount: true, reason: true, createdAt: true } }),
  ]);
  const dayMap = new Map(days.map((d) => [d.date.toISOString().slice(0, 10), d]));
  const calendar = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() - (6 - index) * 86_400_000);
    const row = dayMap.get(date.toISOString().slice(0, 10));
    return { date: date.toISOString().slice(0, 10), xpEarned: row?.xpEarned ?? 0, goalReached: Boolean(row?.goalReachedAt), freezeUsed: Boolean(row?.freezeUsed) };
  });
  return { ...state, ...levelForXp(state.totalXp), today: dayMap.get(today.toISOString().slice(0, 10)) ?? null, week: calendar, recentEvents };
}

export const FREEZE_PURCHASE_COST = FREEZE_COST_XP;
export const MAX_STREAK_FREEZES = MAX_FREEZES;
