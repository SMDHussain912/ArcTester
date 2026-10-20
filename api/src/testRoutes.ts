import { Router } from "express";
import { z } from "zod";
import { badRequest } from "./errors.js";
import {
  CreateTestSchema,
  createTest,
  getResult,
  submitTest,
  SubmitTestSchema,
} from "./testService.js";
import type { PrismaClient } from "@prisma/client";

const AttemptIdSchema = z.object({ id: z.coerce.number().int().positive() });

export function testRouter(db: PrismaClient): Router {
  const router = Router();

  router.post("/tests", async (req, res, next) => {
    try {
      const input = CreateTestSchema.parse(req.body);
      const created = await createTest(db, input);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  router.post("/tests/:id/submit", async (req, res, next) => {
    try {
      const { id } = AttemptIdSchema.parse(req.params);
      const input = SubmitTestSchema.parse(req.body);
      const summary = await submitTest(db, id, input);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  router.get("/tests/:id/result", async (req, res, next) => {
    try {
      const { id } = AttemptIdSchema.parse(req.params);
      const result = await getResult(db, id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/tests/:id", async (req, res, next) => {
    try {
      throw badRequest("Use GET /tests/:id/result after submitting.");
    } catch (error) {
      next(error);
    }
  });

  return router;
}
