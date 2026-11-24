import { createHash, randomBytes } from "node:crypto";
import express, { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, forbidden, notFound } from "./errors.js";
import { requireAuth, type AuthedRequest } from "./auth.js";

const KEY_PREFIX = "arc_student_";
const KEY_SCOPES = ["questions:read", "questions:write", "practice:read", "practice:write"] as const;
const QuestionInput = z.object({
  subject: z.string().trim().min(1).max(100),
  topic: z.string().trim().min(1).max(100).default("General"),
  text: z.string().trim().min(1).max(5000),
  options: z.array(z.string().trim().max(1000)).max(12).default([]),
  correctIndex: z.number().int().min(0).default(0),
  explanation: z.string().max(5000).default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
}).refine((q) => q.options.length === 0 || q.correctIndex < q.options.length, {
  message: "correctIndex must refer to an existing option.",
  path: ["correctIndex"],
});
const PracticeSetInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  durationMinutes: z.number().int().min(1).max(600).default(20),
  questions: z.array(QuestionInput).min(1).max(100),
});
type StudentKey = { id: string; userId: number; scopes: string[] };

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
function sendToolResult(id: unknown, value: unknown) {
  return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(value) }], isError: false } };
}
function hasScope(key: StudentKey, scope: string): boolean { return key.scopes.includes(scope); }

async function authenticateMcp(db: PrismaClient, req: Request, res: Response, next: NextFunction): Promise<void> {
  const match = req.headers.authorization?.match(/^Bearer\s+(arc_student_[A-Za-z0-9_-]{32,})$/);
  if (!match) return next(forbidden("A valid student MCP bearer key is required."));
  try {
    const key = await db.studentMcpKey.findUnique({ where: { keyHash: sha256(match[1]) } });
    if (!key || key.revokedAt) return next(forbidden("This student MCP key is invalid or revoked."));
    const user = await db.user.findUnique({ where: { id: key.userId }, select: { role: true, accessStatus: true } });
    if (!user || user.role !== "STUDENT" || user.accessStatus !== "APPROVED") {
      return next(forbidden("An approved student account is required."));
    }
    await db.studentMcpKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    (req as Request & { studentMcpKey?: StudentKey }).studentMcpKey = { id: key.id, userId: key.userId, scopes: key.scopes };
    next();
  } catch (error) { next(error); }
}

function requireStudent(db: PrismaClient) {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) return res.status(401).json({ error: "Sign in first." });
    try {
      const user = await db.user.findUnique({ where: { id: req.user.id }, select: { role: true, accessStatus: true } });
      if (!user || user.role !== "STUDENT" || user.accessStatus !== "APPROVED") {
        return res.status(403).json({ error: "An approved student account is required." });
      }
      next();
    } catch (error) { next(error); }
  };
}

export function studentMcpRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/student/mcp-keys", requireAuth, requireStudent(db), async (req: AuthedRequest, res, next) => {
    try {
      const keys = await db.studentMcpKey.findMany({
        where: { userId: req.user!.id }, orderBy: { createdAt: "desc" },
        select: { id: true, name: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true },
      });
      res.json({ ok: true, keys });
    } catch (error) { next(error); }
  });

  router.post("/student/mcp-keys", requireAuth, requireStudent(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({
        name: z.string().trim().min(2).max(80),
        scopes: z.array(z.enum(KEY_SCOPES)).min(1).max(KEY_SCOPES.length),
      }).parse(req.body);
      const active = await db.studentMcpKey.count({ where: { userId: req.user!.id, revokedAt: null } });
      if (active >= 5) return next(badRequest("You can keep at most five active MCP keys."));
      const raw = KEY_PREFIX + randomBytes(32).toString("base64url");
      const key = await db.studentMcpKey.create({
        data: { userId: req.user!.id, name: input.name, keyHash: sha256(raw), scopes: [...new Set(input.scopes)] },
        select: { id: true, name: true, scopes: true, createdAt: true },
      });
      // The secret is returned only once; the database stores only its SHA-256 hash.
      res.status(201).json({ ok: true, key: { ...key, secret: raw } });
    } catch (error) { next(error); }
  });

  router.post("/student/mcp-keys/:id/revoke", requireAuth, requireStudent(db), async (req: AuthedRequest, res, next) => {
    try {
      const result = await db.studentMcpKey.updateMany({
        where: { id: req.params.id, userId: req.user!.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!result.count) return next(notFound("Active MCP key not found."));
      res.json({ ok: true, revoked: true });
    } catch (error) { next(error); }
  });

  router.get("/student/private-questions", requireAuth, requireStudent(db), async (req: AuthedRequest, res, next) => {
    try {
      const query = z.object({ search: z.string().max(200).optional(), subject: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(req.query);
      const questions = await db.studentPrivateQuestion.findMany({ where: { userId: req.user!.id, ...(query.subject ? { subject: query.subject } : {}), ...(query.search ? { text: { contains: query.search, mode: "insensitive" } } : {}) }, orderBy: { updatedAt: "desc" }, take: query.limit });
      res.json({ ok: true, questions });
    } catch (error) { next(error); }
  });
  router.post("/student/private-questions", requireAuth, requireStudent(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = QuestionInput.parse(req.body);
      const question = await db.studentPrivateQuestion.create({ data: { ...input, userId: req.user!.id, options: input.options as never } });
      res.status(201).json({ ok: true, question });
    } catch (error) { next(error); }
  });
  router.patch("/student/private-questions/:id", requireAuth, requireStudent(db), async (req: AuthedRequest, res, next) => {
    try {
      const patch = QuestionInput.partial().parse(req.body);
      const existing = await db.studentPrivateQuestion.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
      if (!existing) return next(notFound("Private question not found."));
      const merged = QuestionInput.parse({ ...existing, ...patch, options: patch.options ?? existing.options });
      const question = await db.studentPrivateQuestion.update({ where: { id: existing.id }, data: { ...merged, options: merged.options as never } });
      res.json({ ok: true, question });
    } catch (error) { next(error); }
  });
  router.delete("/student/private-questions/:id", requireAuth, requireStudent(db), async (req: AuthedRequest, res, next) => {
    try {
      const result = await db.studentPrivateQuestion.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
      if (!result.count) return next(notFound("Private question not found."));
      res.json({ ok: true, deleted: true });
    } catch (error) { next(error); }
  });
  router.post("/student/private-questions/import", requireAuth, requireStudent(db), expressJsonLimit, async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ questions: z.array(QuestionInput).min(1).max(500) }).parse(req.body);
      const result = await db.studentPrivateQuestion.createMany({ data: input.questions.map(q => ({ ...q, userId: req.user!.id, options: q.options as never })) });
      res.status(201).json({ ok: true, imported: result.count });
    } catch (error) { next(error); }
  });
  router.get("/student/practice-sets", requireAuth, requireStudent(db), async (req: AuthedRequest, res, next) => {
    try {
      const sets = await db.studentPracticeSet.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: "desc" }, take: 100 });
      res.json({ ok: true, practiceTests: sets });
    } catch (error) { next(error); }
  });
  router.post("/student/practice-sets", requireAuth, requireStudent(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = PracticeSetInput.parse(req.body);
      const set = await db.studentPracticeSet.create({ data: { ...input, userId: req.user!.id, questions: input.questions as never } });
      res.status(201).json({ ok: true, practiceTest: set });
    } catch (error) { next(error); }
  });
  router.delete("/student/practice-sets/:id", requireAuth, requireStudent(db), async (req: AuthedRequest, res, next) => {
    try {
      const result = await db.studentPracticeSet.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
      if (!result.count) return next(notFound("Practice test not found."));
      res.json({ ok: true, deleted: true });
    } catch (error) { next(error); }
  });

  // Streamable HTTP MCP endpoint. Each key is student-owned and scope-limited.
  router.post("/mcp/student", expressJsonLimit, authenticateMcp.bind(null, db), async (req: Request & { studentMcpKey?: StudentKey }, res) => {
    const body = req.body as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
    const id = body?.id;
    if (body?.jsonrpc !== "2.0" || typeof body.method !== "string") {
      return res.status(400).json(jsonRpcError(id, -32600, "Invalid JSON-RPC request."));
    }
    if (body.method === "notifications/initialized" || body.method === "notifications/cancelled") {
      return res.status(202).end();
    }
    if (body.method === "initialize") {
      return res.json({ jsonrpc: "2.0", id, result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "arctester-student-mcp", version: "1.0.0" },
      } });
    }
    const key = req.studentMcpKey!;
    if (body.method === "ping") return res.json({ jsonrpc: "2.0", id, result: {} });
    if (body.method === "tools/list") {
      const tools = [
        { name: "list_my_questions", description: "List only your private practice questions.", inputSchema: { type: "object", properties: { search: { type: "string" }, subject: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } } } },
        { name: "create_my_questions", description: "Create private questions in your own question bank. Batch size max 100.", inputSchema: { type: "object", required: ["questions"], properties: { questions: { type: "array", maxItems: 100, items: { type: "object" } } } } },
        { name: "edit_my_question", description: "Edit one of your own private questions.", inputSchema: { type: "object", required: ["id", "patch"], properties: { id: { type: "string" }, patch: { type: "object" } } } },
        { name: "delete_my_question", description: "Delete one of your own private questions.", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
        { name: "create_my_practice_test", description: "Create a private practice test from AI-generated questions; does not publish or assign an official exam.", inputSchema: { type: "object", required: ["title", "questions"], properties: { title: { type: "string" }, description: { type: "string" }, durationMinutes: { type: "integer", minimum: 1, maximum: 600 }, questions: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } } } } },
        { name: "list_my_practice_tests", description: "List your saved private practice tests.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } } },
      ];
      return res.json({ jsonrpc: "2.0", id, result: { tools } });
    }
    if (body.method !== "tools/call") return res.json(jsonRpcError(id, -32601, "Method not found."));
    const params = body.params as { name?: unknown; arguments?: unknown };
    if (typeof params?.name !== "string") return res.json(jsonRpcError(id, -32602, "Tool name is required."));
    const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
    try {
      let output: unknown;
      switch (params.name) {
        case "list_my_questions": {
          if (!hasScope(key, "questions:read")) return res.json(jsonRpcError(id, -32003, "Missing questions:read scope."));
          const input = z.object({ search: z.string().max(200).optional(), subject: z.string().max(100).optional(), limit: z.number().int().min(1).max(100).default(50) }).parse(args);
          const questions = await db.studentPrivateQuestion.findMany({
            where: { userId: key.userId, ...(input.subject ? { subject: input.subject } : {}), ...(input.search ? { text: { contains: input.search, mode: "insensitive" } } : {}) },
            orderBy: { updatedAt: "desc" }, take: input.limit,
          });
          output = { questions }; break;
        }
        case "create_my_questions": {
          if (!hasScope(key, "questions:write")) return res.json(jsonRpcError(id, -32003, "Missing questions:write scope."));
          const input = z.object({ questions: z.array(QuestionInput).min(1).max(100) }).parse(args);
          const created = await db.studentPrivateQuestion.createMany({ data: input.questions.map(q => ({ ...q, userId: key.userId, options: q.options as never })) });
          output = { created: created.count }; break;
        }
        case "edit_my_question": {
          if (!hasScope(key, "questions:write")) return res.json(jsonRpcError(id, -32003, "Missing questions:write scope."));
          const input = z.object({ id: z.string().min(1), patch: QuestionInput.partial() }).parse(args);
          const existing = await db.studentPrivateQuestion.findFirst({ where: { id: input.id, userId: key.userId } });
          if (!existing) return res.json(jsonRpcError(id, -32004, "Private question not found."));
          const patch = input.patch;
          const merged = QuestionInput.parse({ ...existing, ...patch, options: patch.options ?? existing.options });
          const updated = await db.studentPrivateQuestion.update({ where: { id: existing.id }, data: { ...merged, options: merged.options as never } });
          output = { question: updated }; break;
        }
        case "delete_my_question": {
          if (!hasScope(key, "questions:write")) return res.json(jsonRpcError(id, -32003, "Missing questions:write scope."));
          const input = z.object({ id: z.string().min(1) }).parse(args);
          const result = await db.studentPrivateQuestion.deleteMany({ where: { id: input.id, userId: key.userId } });
          if (!result.count) return res.json(jsonRpcError(id, -32004, "Private question not found."));
          output = { deleted: true }; break;
        }
        case "create_my_practice_test": {
          if (!hasScope(key, "practice:write")) return res.json(jsonRpcError(id, -32003, "Missing practice:write scope."));
          const input = PracticeSetInput.parse(args);
          const set = await db.studentPracticeSet.create({ data: { ...input, userId: key.userId, questions: input.questions as never } });
          output = { practiceTest: set }; break;
        }
        case "list_my_practice_tests": {
          if (!hasScope(key, "practice:read")) return res.json(jsonRpcError(id, -32003, "Missing practice:read scope."));
          const input = z.object({ limit: z.number().int().min(1).max(100).default(50) }).parse(args);
          const tests = await db.studentPracticeSet.findMany({ where: { userId: key.userId }, orderBy: { updatedAt: "desc" }, take: input.limit, select: { id: true, title: true, description: true, durationMinutes: true, createdAt: true, updatedAt: true } });
          output = { practiceTests: tests }; break;
        }
        default: return res.json(jsonRpcError(id, -32602, "Unknown tool."));
      }
      return res.json(sendToolResult(id, output));
    } catch (error) {
      const message = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join("; ") : "Tool request failed.";
      return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: message }], isError: true } });
    }
  });

  return router;
}

function expressJsonLimit(req: Request, res: Response, next: NextFunction) {
  express.json({ limit: "8mb" })(req, res, next);
}
