import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { awardXp, levelForXp, REWARD_XP } from "./gamificationService.js";

function fakeTx(overrides: Record<string, unknown> = {}) {
  const state = {
    totalXp: 0, xpBalance: 0, currentStreak: 0, longestStreak: 0,
    lastActivityDate: null as Date | null, dailyGoalXp: 50, streakFreezeInventory: 1,
  };
  const daily = { xpEarned: 0, goalReachedAt: null as Date | null };
  const tx = {
    userGamification: {
      upsert: vi.fn(async () => ({ ...state })),
      update: vi.fn(async () => ({ ...state, totalXp: 20, xpBalance: 20 })),
    },
    xpLedger: { createMany: vi.fn(async () => ({ count: 1 })) },
    gamificationDay: {
      upsert: vi.fn(async () => ({ ...daily })),
      update: vi.fn(async () => ({ ...daily, xpEarned: 60, goalReachedAt: new Date("2026-01-01T00:00:00Z") })),
      findUnique: vi.fn(async () => ({ ...daily })),
    },
    ...overrides,
  };
  return tx as unknown as Prisma.TransactionClient & typeof tx;
}

describe("gamification service", () => {
  it("computes stable 100-XP level boundaries", () => {
    expect(levelForXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpToNextLevel: 100 });
    expect(levelForXp(99)).toEqual({ level: 1, xpIntoLevel: 99, xpToNextLevel: 1 });
    expect(levelForXp(100)).toEqual({ level: 2, xpIntoLevel: 0, xpToNextLevel: 100 });
    expect(levelForXp(350)).toEqual({ level: 4, xpIntoLevel: 50, xpToNextLevel: 50 });
  });

  it("defines the intended XP rewards", () => {
    expect(REWARD_XP).toEqual({ lesson: 20, "unit-test": 50, practice: 10 });
  });

  it("awards an XP event once and does not duplicate it", async () => {
    const tx = fakeTx();
    const first = await awardXp(tx, 4, "lesson-complete:7", "lesson", new Date("2026-11-21T12:00:00Z"));
    expect(first.awarded).toBe(true);
    expect(first.xpAwarded).toBe(20);
    const duplicateTx = fakeTx({
      userGamification: { upsert: vi.fn(async () => ({ totalXp: 20, currentStreak: 1, dailyGoalXp: 50, streakFreezeInventory: 1 })) },
      xpLedger: { createMany: vi.fn(async () => ({ count: 0 })) },
      gamificationDay: { findUnique: vi.fn(async () => ({ xpEarned: 20, goalReachedAt: null })) },
    });
    const duplicate = await awardXp(duplicateTx, 4, "lesson-complete:7", "lesson", new Date("2026-11-21T12:00:00Z"));
    expect(duplicate.awarded).toBe(false);
    expect(duplicate.xpAwarded).toBe(0);
  });

  it("adds the daily-goal bonus when a 50-XP unit test reaches the goal", async () => {
    const tx = fakeTx({
      userGamification: {
        upsert: vi.fn(async () => ({ totalXp: 0, xpBalance: 0, currentStreak: 0, longestStreak: 0, lastActivityDate: null, dailyGoalXp: 50, streakFreezeInventory: 1 })),
        update: vi.fn()
          .mockResolvedValueOnce({ totalXp: 50, xpBalance: 50 })
          .mockResolvedValueOnce({ totalXp: 60, xpBalance: 60 }),
      },
      gamificationDay: {
        upsert: vi.fn(async () => ({ xpEarned: 50, goalReachedAt: null })),
        update: vi.fn(async () => ({ xpEarned: 60, goalReachedAt: new Date("2026-11-21T12:00:00Z") })),
      },
    });
    const result = await awardXp(tx, 4, "unit-test-passed:3", "unit-test", new Date("2026-11-21T12:00:00Z"));
    expect(result.xpAwarded).toBe(50);
    expect(result.goalBonus).toBe(10);
    expect(result.totalXp).toBe(60);
    expect(result.goalReached).toBe(true);
  });

  it("uses one stored freeze to bridge exactly one missed day", async () => {
    const now = new Date("2026-11-21T12:00:00Z");
    const tx = fakeTx({
      userGamification: {
        upsert: vi.fn(async () => ({ totalXp: 0, xpBalance: 0, currentStreak: 5, longestStreak: 7,
          lastActivityDate: new Date("2026-11-19T00:00:00Z"), dailyGoalXp: 200, streakFreezeInventory: 1 })),
        update: vi.fn(async () => ({ totalXp: 10, xpBalance: 10 })),
      },
    });
    const result = await awardXp(tx, 4, "practice-test:9", "practice", now);
    expect(result.currentStreak).toBe(6);
    expect(tx.gamificationDay.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ freezeUsed: true, date: new Date("2026-11-20T00:00:00Z") }),
    }));
  });
});
