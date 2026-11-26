import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, type AuthedRequest } from "./auth.js";
import { badRequest, conflict } from "./errors.js";
import { gamificationSnapshot, FREEZE_PURCHASE_COST, MAX_STREAK_FREEZES } from "./gamificationService.js";

export function gamificationRouter(db: PrismaClient): Router {
  const router = Router();
  router.get("/gamification", requireAuth, async (req: AuthedRequest, res, next) => {
    try { res.json(await gamificationSnapshot(db, req.user!.id)); }
    catch (error) { next(error); }
  });
  router.post("/gamification/daily-goal", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const { dailyGoalXp } = z.object({ dailyGoalXp: z.number().int().min(20).max(200) }).strict().parse(req.body);
      const state = await db.userGamification.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, dailyGoalXp }, update: { dailyGoalXp } });
      res.json({ dailyGoalXp: state.dailyGoalXp });
    } catch (error) { next(error); }
  });
  router.post("/gamification/streak-freeze/buy", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const result = await db.$transaction(async (tx) => {
        const state = await tx.userGamification.upsert({ where: { userId }, create: { userId }, update: {} });
        if (state.streakFreezeInventory >= MAX_STREAK_FREEZES) throw conflict("You already have the maximum number of streak freezes.");
        if (state.xpBalance < FREEZE_PURCHASE_COST) throw badRequest("You need 100 XP to buy a streak freeze.");
        const updated = await tx.userGamification.update({ where: { userId }, data: { xpBalance: { decrement: FREEZE_PURCHASE_COST }, streakFreezeInventory: { increment: 1 } } });
        await tx.xpLedger.create({ data: { userId, eventKey: "streak-freeze-purchase:" + randomUUID(), amount: -FREEZE_PURCHASE_COST, reason: "streak-freeze-purchase" } });
        return { totalXp: updated.totalXp, xpBalance: updated.xpBalance, streakFreezeInventory: updated.streakFreezeInventory };
      }, { isolationLevel: "Serializable" });
      res.json(result);
    } catch (error) { next(error); }
  });
  return router;
}
