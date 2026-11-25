import { createHash, randomBytes } from "node:crypto";
import express, { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { forbidden, badRequest, notFound } from "./errors.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "./auth.js";
import { importFromJson } from "./importService.js";
import { QuestionInputSchema, hashQuestion, encodeOptions } from "./questions.js";
import { evaluateModelArtifacts } from "./modelInference.js";

const PREFIX = "arc_admin_";
const SCOPES = ["questions:read", "questions:create", "questions:review", "papers:create", "papers:read", "papers:publish", "exams:assign", "announcements:write", "activity:read", "models:read", "models:dataset:create", "models:verification:read", "models:train", "models:register", "models:evaluate", "models:activate"] as const;
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
type KeyContext = { id: string; userId: number; scopes: string[] };
function scope(key: KeyContext, required: string) { return key.scopes.includes(required); }
function rpcError(id: unknown, code: number, message: string) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message } }; }
function rpcResult(id: unknown, value: unknown) { return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(value) }], isError: false } }; }

async function authAdminKey(db: PrismaClient, req: Request, _res: Response, next: NextFunction) {
  const match = req.headers.authorization?.match(/^Bearer\s+(arc_admin_[A-Za-z0-9_-]{32,})$/);
  if (!match) return next(forbidden("A valid administrator MCP bearer key is required."));
  try {
    const key = await db.adminMcpKey.findUnique({ where: { keyHash: sha(match[1]) } });
    if (!key || key.revokedAt) return next(forbidden("This administrator MCP key is invalid or revoked."));
    const user = await db.user.findUnique({ where: { id: key.userId }, select: { role: true, accessStatus: true } });
    if (!user || user.role !== "ADMIN" || user.accessStatus !== "APPROVED") return next(forbidden("Administrator access is required."));
    await db.adminMcpKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    (req as Request & { adminMcpKey?: KeyContext }).adminMcpKey = { id: key.id, userId: key.userId, scopes: key.scopes };
    next();
  } catch (error) { next(error); }
}
function parser(req: Request, res: Response, next: NextFunction) { express.json({ limit: "8mb" })(req, res, next); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + stableJson(v)).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
function modelAuditId() { return randomBytes(16).toString("hex"); }
function safeArtifactJson(raw: string) {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const allowed = ["uri", "sha256", "framework", "inputSchema", "outputSchema", "metrics", "version", "algorithm"];
    return Object.fromEntries(allowed.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
  } catch { return {}; }
}

export function adminMcpRouter(db: PrismaClient): Router {
  const router = Router();
  router.get("/admin/mcp-keys", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const keys = await db.adminMcpKey.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true } });
      res.json({ ok: true, keys });
    } catch (error) { next(error); }
  });
  router.post("/admin/mcp-keys", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ name: z.string().trim().min(2).max(80), scopes: z.array(z.enum(SCOPES)).min(1).max(SCOPES.length) }).parse(req.body);
      const active = await db.adminMcpKey.count({ where: { userId: req.user!.id, revokedAt: null } });
      if (active >= 5) return next(badRequest("You can keep at most five active administrator MCP keys."));
      const raw = PREFIX + randomBytes(32).toString("base64url");
      const key = await db.adminMcpKey.create({ data: { userId: req.user!.id, name: input.name, keyHash: sha(raw), scopes: [...new Set(input.scopes)] }, select: { id: true, name: true, scopes: true, createdAt: true } });
      res.status(201).json({ ok: true, key: { ...key, secret: raw } });
    } catch (error) { next(error); }
  });
  router.post("/admin/mcp-keys/:id/revoke", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const result = await db.adminMcpKey.updateMany({ where: { id: req.params.id, userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (!result.count) return next(notFound("Active MCP key not found."));
      res.json({ ok: true, revoked: true });
    } catch (error) { next(error); }
  });

  router.post("/mcp/admin", parser, authAdminKey.bind(null, db), async (req: Request & { adminMcpKey?: KeyContext }, res) => {
    const body = req.body as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
    const id = body?.id;
    if (body?.jsonrpc !== "2.0" || typeof body.method !== "string") return res.status(400).json(rpcError(id, -32600, "Invalid JSON-RPC request."));
    if (body.method === "notifications/initialized" || body.method === "notifications/cancelled") return res.status(202).end();
    if (body.method === "initialize") return res.json({ jsonrpc: "2.0", id, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "arctester-admin-mcp", version: "1.0.0" } } });
    if (body.method === "ping") return res.json({ jsonrpc: "2.0", id, result: {} });
    const key = req.adminMcpKey!;
    if (body.method === "tools/list") {
      return res.json({ jsonrpc: "2.0", id, result: { tools: [
        { name: "search_question_bank", description: "Search official ArcTester question bank by subject/topic/review status.", inputSchema: { type: "object", properties: { search: { type: "string" }, subject: { type: "string" }, topic: { type: "string" }, reviewStatus: { type: "string", enum: ["DRAFT","APPROVED","REJECTED"] }, limit: { type: "integer", minimum: 1, maximum: 100 } } } },
        { name: "create_questions", description: "Import new official question drafts. These are not automatically approved.", inputSchema: { type: "object", required: ["questions"], properties: { questions: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } } } } },
        { name: "approve_questions", description: "Approve selected draft questions only after explicit confirm=true. Requires source information.", inputSchema: { type: "object", required: ["ids","confirm"], properties: { ids: { type: "array", minItems: 1, maxItems: 200 }, confirm: { type: "boolean" } } } },
        { name: "edit_question", description: "Edit one official question by ID. Only existing fields supplied in patch are changed.", inputSchema: { type: "object", required: ["id","patch"], properties: { id: { type: "integer" }, patch: { type: "object" } } } },
        { name: "reject_questions", description: "Reject selected draft questions only after explicit confirm=true.", inputSchema: { type: "object", required: ["ids","confirm"], properties: { ids: { type: "array", minItems: 1, maxItems: 200 }, confirm: { type: "boolean" } } } },
        { name: "create_question_paper", description: "Create an unpublished exam draft from approved official questions. No students are assigned.", inputSchema: { type: "object", required: ["title","questionIds","durationMinutes"], properties: { title: { type: "string" }, description: { type: "string" }, instructions: { type: "string" }, questionIds: { type: "array", minItems: 1, maxItems: 200 }, durationMinutes: { type: "integer", minimum: 1, maximum: 600 }, marks: { type: "number" }, negativeMarks: { type: "number" } } } },
        { name: "publish_question_paper", description: "Publish a saved exam draft only after explicit confirm=true. This makes the exam eligible for assignment.", inputSchema: { type: "object", required: ["examId","confirm"], properties: { examId: { type: "string" }, confirm: { type: "boolean" } } } },
        { name: "assign_question_paper", description: "Assign a published exam to approved student IDs only after explicit confirm=true. Existing assignments are skipped.", inputSchema: { type: "object", required: ["examId","studentIds","confirm"], properties: { examId: { type: "string" }, studentIds: { type: "array", minItems: 1, maxItems: 1000 }, availableFrom: { type: "string" }, dueAt: { type: "string" }, confirm: { type: "boolean" } } } },
        { name: "list_exam_results", description: "Read recent official exam submission summaries.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } } },
        { name: "create_announcement", description: "Create an administrator announcement for students.", inputSchema: { type: "object", required: ["title","message"], properties: { title: { type: "string" }, message: { type: "string" }, expiresAt: { type: "string" } } } },
        { name: "read_mcp_audit", description: "Read recent tool names and sanitized audit summaries. Secrets and request bodies are never included.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } } },
        { name: "list_registered_models", description: "List registered model versions and active assignment by modelId. Does not run inference.", inputSchema: { type: "object", properties: { modelId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } } } },
        { name: "create_model_dataset", description: "Create a fingerprinted, provenance-labelled dataset from supplied rows. Never import raw student records; provide de-identified or synthetic samples.", inputSchema: { type: "object", required: ["name","task","targetColumn","targetType","featureSchema","samples","sourceDescription","datasetKind"], properties: { name: { type: "string" }, task: { type: "string", enum: ["classification","regression"] }, targetColumn: { type: "string" }, targetType: { type: "string", enum: ["string","number"] }, featureSchema: { type: "array", items: { type: "object", required: ["name","type"], properties: { name: { type: "string" }, type: { type: "string", enum: ["string","number","boolean"] } } } }, samples: { type: "array", minItems: 1, maxItems: 500, items: { type: "object" } }, sourceDescription: { type: "string" }, sourceAttested: { type: "boolean" }, confirmSourceAttestation: { type: "boolean" }, datasetKind: { type: "string", enum: ["training","validation","verification","synthetic"] } } } },
        { name: "get_model_verification_data", description: "Read a page of rows from an attested verification dataset for offline evaluation.", inputSchema: { type: "object", required: ["datasetId"], properties: { datasetId: { type: "string" }, offset: { type: "integer", minimum: 0, maximum: 10000 }, limit: { type: "integer", minimum: 1, maximum: 100 } } } },
        { name: "queue_model_training", description: "Queue a training job. It remains QUEUED until a configured worker claims and completes it; this tool does not train inline.", inputSchema: { type: "object", required: ["datasetId","modelId","confirm"], properties: { datasetId: { type: "string" }, modelId: { type: "string" }, seed: { type: "integer", minimum: 0, maximum: 1000000 }, epochs: { type: "integer", minimum: 1, maximum: 200 }, batchSize: { type: "integer", minimum: 1, maximum: 512 }, confirm: { type: "boolean" } } } },
        { name: "list_model_training_jobs", description: "Read recent model training jobs and worker status.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } } },
        { name: "register_model_version", description: "Register a candidate artifact URI and SHA-256 for a model version. Registration does not activate it.", inputSchema: { type: "object", required: ["modelId","version","algorithm","task","datasetId","artifactUri","sha256","confirm"], properties: { modelId: { type: "string" }, version: { type: "integer", minimum: 1 }, algorithm: { type: "string", enum: ["random_forest","gradient_boosting","logistic_regression","linear_regression","xgboost","pytorch","custom"] }, task: { type: "string", enum: ["classification","regression"] }, datasetId: { type: "string" }, artifactUri: { type: "string" }, sha256: { type: "string" }, framework: { type: "string" }, inputSchema: { type: "object" }, outputSchema: { type: "object" }, confirm: { type: "boolean" } } } },
        { name: "record_model_evaluation", description: "Record an admin-attested candidate-vs-baseline result on an attested verification dataset. Candidate must not regress on the primary metric.", inputSchema: { type: "object", required: ["modelId","candidateVersion","baselineVersion","datasetId","sampleCount","metrics","confirm"], properties: { modelId: { type: "string" }, candidateVersion: { type: "integer", minimum: 1 }, baselineVersion: { type: "integer", minimum: 1 }, datasetId: { type: "string" }, sampleCount: { type: "integer", minimum: 1 }, metrics: { type: "object" }, confirm: { type: "boolean" } } } },
        { name: "evaluate_registered_model", description: "Compute candidate and baseline predictions from registered native artifacts on an attested verification dataset. Records real accuracy or MAE; does not train or activate.", inputSchema: { type: "object", required: ["modelId","candidateVersion","baselineVersion","datasetId","confirm"], properties: { modelId: { type: "string" }, candidateVersion: { type: "integer", minimum: 1 }, baselineVersion: { type: "integer", minimum: 1 }, datasetId: { type: "string" }, confirm: { type: "boolean" } } } },
        { name: "activate_model_version", description: "Assign a registered version as active for its modelId only after a passing verification evaluation and explicit confirmation. This updates registry assignment; inference consumers must separately support the modelId.", inputSchema: { type: "object", required: ["modelId","version","confirm"], properties: { modelId: { type: "string" }, version: { type: "integer", minimum: 1 }, confirm: { type: "boolean" } } } },
      ] } });
    }
    if (body.method !== "tools/call") return res.json(rpcError(id, -32601, "Method not found."));
    const params = body.params as { name?: unknown; arguments?: unknown };
    if (typeof params?.name !== "string") return res.json(rpcError(id, -32602, "Tool name is required."));
    const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
    let success = false, summary = "";
    try {
      let output: unknown;
      switch (params.name) {
        case "search_question_bank": {
          if (!scope(key,"questions:read")) return res.json(rpcError(id,-32003,"Missing questions:read scope."));
          const input=z.object({search:z.string().max(200).optional(),subject:z.string().max(100).optional(),topic:z.string().max(100).optional(),reviewStatus:z.enum(["DRAFT","APPROVED","REJECTED"]).optional(),limit:z.number().int().min(1).max(100).default(50)}).parse(args);
          const questions=await db.question.findMany({where:{...(input.subject?{subject:{name:input.subject}}:{}),...(input.topic?{topic:{name:input.topic}}:{}),...(input.reviewStatus?{reviewStatus:input.reviewStatus}:{}),...(input.search?{text:{contains:input.search,mode:"insensitive"}}:{})},take:input.limit,orderBy:{createdAt:"desc"},include:{subject:{select:{name:true}},topic:{select:{name:true}}}});
          output={questions:questions.map(q=>({id:q.id,subject:q.subject.name,topic:q.topic?.name??"General",text:q.text,options:JSON.parse(q.options),correctIndex:q.correctIndex,explanation:q.explanation,source:q.source,difficulty:q.difficulty,reviewStatus:q.reviewStatus}))};summary="searched questions";break;
        }
        case "create_questions": {
          if(!scope(key,"questions:create"))return res.json(rpcError(id,-32003,"Missing questions:create scope."));
          const input=z.object({questions:z.array(QuestionInputSchema).min(1).max(100)}).parse(args);
          output=await importFromJson(db,input.questions);summary="created question drafts";break;
        }
        case "approve_questions": {
          if(!scope(key,"questions:review"))return res.json(rpcError(id,-32003,"Missing questions:review scope."));
          const input=z.object({ids:z.array(z.number().int().positive()).min(1).max(200),confirm:z.literal(true)}).parse(args);
          if(new Set(input.ids).size!==input.ids.length)return res.json(rpcError(id,-32602,"Question IDs must be unique."));
          const rows=await db.question.findMany({where:{id:{in:input.ids}},select:{id:true,source:true,reviewStatus:true}});
          if(rows.length!==input.ids.length)return res.json(rpcError(id,-32004,"One or more question IDs were not found."));
          if(rows.some(q=>q.reviewStatus!=="DRAFT"||!q.source.trim()||q.source.trim().toUpperCase()==="NEEDS HUMAN REVIEW"))return res.json(rpcError(id,-32002,"Only sourced draft questions can be approved."));
          const result=await db.question.updateMany({where:{id:{in:input.ids},reviewStatus:"DRAFT"},data:{reviewStatus:"APPROVED"}});
          output={approved:result.count};summary="approved "+result.count+" sourced drafts";break;
        }
        case "edit_question": {
          if (!scope(key, "questions:create")) return res.json(rpcError(id, -32003, "Missing questions:create scope."));
          const input = z.object({ id: z.number().int().positive(), patch: z.object({
            subject: z.string().trim().min(1).max(100).optional(), topic: z.string().trim().min(1).max(100).optional(),
            text: z.string().trim().min(1).max(5000).optional(), options: z.array(z.string().trim()).optional(),
            correctIndex: z.number().int().min(0).optional(), explanation: z.string().max(5000).optional(),
            source: z.string().max(500).optional(), difficulty: z.enum(["easy","medium","hard"]).optional(),
            questionType: z.enum(["mcq","multi_select","true_false","fill_blank","numeric","matching"]).optional(),
            promptData: z.record(z.string(),z.unknown()).optional(), answerData: z.record(z.string(),z.unknown()).optional(),
          }).refine(value => Object.keys(value).length > 0) }).parse(args);
          const existing = await db.question.findUnique({ where: { id: input.id }, include: { subject: true, topic: true } });
          if (!existing) return res.json(rpcError(id, -32004, "Question not found."));
          const merged = QuestionInputSchema.parse({
            subject: input.patch.subject ?? existing.subject.name, topic: input.patch.topic ?? existing.topic?.name ?? "General",
            text: input.patch.text ?? existing.text, options: input.patch.options ?? JSON.parse(existing.options),
            correctIndex: input.patch.correctIndex ?? existing.correctIndex, explanation: input.patch.explanation ?? existing.explanation,
            source: input.patch.source ?? existing.source, difficulty: input.patch.difficulty ?? existing.difficulty,
            questionType: input.patch.questionType ?? existing.questionType, promptData: input.patch.promptData ?? JSON.parse(existing.promptData),
            answerData: input.patch.answerData ?? JSON.parse(existing.answerData),
          });
          const subject = await db.subject.upsert({ where: { name: merged.subject }, create: { name: merged.subject }, update: {} });
          const topic = await db.topic.upsert({ where: { subjectId_name: { subjectId: subject.id, name: merged.topic } }, create: { subjectId: subject.id, name: merged.topic }, update: {} });
          const question = await db.question.update({ where: { id: existing.id }, data: {
            subjectId: subject.id, topicId: topic.id, text: merged.text, options: encodeOptions(merged.options),
            correctIndex: merged.correctIndex, explanation: merged.explanation, source: merged.source, difficulty: merged.difficulty,
            questionType: merged.questionType, promptData: JSON.stringify(merged.promptData), answerData: JSON.stringify(merged.answerData), questionHash: hashQuestion(merged.text), reviewStatus: "DRAFT",
          }, select: { id: true, text: true, reviewStatus: true } });
          output = { question }; summary = "edited question " + question.id; break;
        }
        case "reject_questions": {
          if (!scope(key, "questions:review")) return res.json(rpcError(id, -32003, "Missing questions:review scope."));
          const input = z.object({ ids: z.array(z.number().int().positive()).min(1).max(200), confirm: z.literal(true) }).parse(args);
          if (new Set(input.ids).size !== input.ids.length) return res.json(rpcError(id, -32602, "Question IDs must be unique."));
          const result = await db.question.updateMany({ where: { id: { in: input.ids }, reviewStatus: "DRAFT" }, data: { reviewStatus: "REJECTED" } });
          output = { rejected: result.count }; summary = "rejected " + result.count + " drafts"; break;
        }
        case "create_question_paper": {
          if(!scope(key,"papers:create"))return res.json(rpcError(id,-32003,"Missing papers:create scope."));
          const input=z.object({title:z.string().trim().min(2).max(120),description:z.string().max(2000).default(""),instructions:z.string().max(5000).default(""),questionIds:z.array(z.number().int().positive()).min(1).max(200),durationMinutes:z.number().int().min(1).max(600),marks:z.number().min(0).max(100).default(1),negativeMarks:z.number().min(0).max(100).default(0)}).parse(args);
          if(new Set(input.questionIds).size!==input.questionIds.length)return res.json(rpcError(id,-32602,"Question IDs must be unique."));
          const questions=await db.question.findMany({where:{id:{in:input.questionIds},reviewStatus:"APPROVED"},include:{subject:true,topic:true}});
          if(questions.length!==input.questionIds.length)return res.json(rpcError(id,-32002,"Every selected question must exist and be approved."));
          const byId=new Map(questions.map(q=>[q.id,q]));
          const created=await db.$transaction(async tx=>{
            const exam=await tx.exam.create({data:{title:input.title,description:input.description,createdById:key.userId}});
            const version=await tx.examVersion.create({data:{examId:exam.id,version:1,instructions:input.instructions,durationMinutes:input.durationMinutes,shuffleQuestions:false,shuffleOptions:false}});
            await tx.examVersionQuestion.createMany({data:input.questionIds.map((qid,position)=>{const q=byId.get(qid)!;return{examVersionId:version.id,sourceQuestionId:q.id,position,subject:q.subject.name,topic:q.topic?.name??null,text:q.text,options:JSON.stringify(JSON.parse(q.options)),correctIndex:q.correctIndex,explanation:q.explanation,marks:input.marks,negativeMarks:input.negativeMarks};})});
            return {id:exam.id,title:exam.title,version:1,questions:input.questionIds.length,status:"DRAFT"};
          });output={paper:created};summary="created unpublished exam draft";break;
        }
        case "publish_question_paper": {
          if (!scope(key, "papers:publish")) return res.json(rpcError(id, -32003, "Missing papers:publish scope."));
          const input = z.object({ examId: z.string().min(1), confirm: z.literal(true) }).parse(args);
          const exam = await db.exam.findUnique({ where: { id: input.examId }, include: { versions: { orderBy: { version: "desc" }, take: 1, include: { _count: { select: { questions: true } } } } } });
          const version = exam?.versions[0];
          if (!exam || !version) return res.json(rpcError(id, -32004, "Exam draft not found."));
          if (exam.status === "ARCHIVED") return res.json(rpcError(id, -32002, "Archived exam cannot be published."));
          if (version._count.questions === 0) return res.json(rpcError(id, -32002, "Add at least one question before publishing."));
          const publishedAt = version.publishedAt ?? new Date();
          await db.$transaction([
            db.examVersion.update({ where: { id: version.id }, data: { publishedAt } }),
            db.exam.update({ where: { id: exam.id }, data: { status: "PUBLISHED" } }),
          ]);
          output = { examId: exam.id, versionId: version.id, status: "PUBLISHED", publishedAt }; summary = "published exam " + exam.id; break;
        }
        case "assign_question_paper": {
          if (!scope(key, "exams:assign")) return res.json(rpcError(id, -32003, "Missing exams:assign scope."));
          const input = z.object({ examId: z.string().min(1), studentIds: z.array(z.number().int().positive()).min(1).max(1000), availableFrom: z.string().datetime().optional(), dueAt: z.string().datetime().optional(), confirm: z.literal(true) }).refine(v => new Set(v.studentIds).size === v.studentIds.length, { message: "Student IDs must be unique." }).refine(v => !v.availableFrom || !v.dueAt || new Date(v.dueAt) > new Date(v.availableFrom), { message: "Due date must be after availability date." }).parse(args);
          const exam = await db.exam.findUnique({ where: { id: input.examId }, include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1 } } });
          const version = exam?.versions[0];
          if (!exam || !version) return res.json(rpcError(id, -32004, "No published exam version is available to assign."));
          if (exam.status === "ARCHIVED") return res.json(rpcError(id, -32002, "Archived exams cannot receive assignments."));
          const students = await db.user.findMany({ where: { id: { in: input.studentIds }, role: "STUDENT", accessStatus: "APPROVED" }, select: { id: true } });
          if (students.length !== input.studentIds.length) return res.json(rpcError(id, -32002, "One or more student IDs are not approved students."));
          const assigned = await db.$transaction(async tx => {
            const results: { assignmentId: string; studentId: number }[] = [];
            let skipped = 0;
            for (const studentId of input.studentIds) {
              const existing = await tx.examAssignment.findUnique({ where: { examVersionId_studentId: { examVersionId: version.id, studentId } }, select: { id: true } });
              if (existing) { skipped += 1; continue; }
              const assignment = await tx.examAssignment.create({ data: {
                examVersionId: version.id, studentId, assignedById: key.userId,
                availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
                dueAt: input.dueAt ? new Date(input.dueAt) : null,
              }, select: { id: true, studentId: true } });
              const prefs = await tx.studentNotificationPreference.findUnique({ where: { userId: studentId }, select: { examAssignments: true } });
              if (prefs?.examAssignments !== false) {
                await tx.studentNotification.create({ data: {
                  userId: studentId, kind: "EXAM_ASSIGNMENT", title: "New exam assigned",
                  message: exam.title + " has been assigned to you. Open your assigned exams for details.",
                  href: "/assignments", dedupeKey: "exam-assignment:" + assignment.id,
                } });
              }
              results.push({ assignmentId: assignment.id, studentId });
            }
            return { results, skipped };
          });
          output = { created: assigned.results.length, skippedExisting: assigned.skipped, assignments: assigned.results }; summary = "assigned exam to " + assigned.results.length + " students"; break;
        }
        case "list_exam_results": {
          if(!scope(key,"papers:read"))return res.json(rpcError(id,-32003,"Missing papers:read scope."));
          const input=z.object({limit:z.number().int().min(1).max(100).default(50)}).parse(args);
          const rows=await db.examSubmission.findMany({take:input.limit,orderBy:{receivedAt:"desc"},include:{assignment:{include:{student:{select:{id:true}},examVersion:{include:{exam:{select:{id:true,title:true}}}}}}}});
          output={results:rows.map(x=>({submissionId:x.id,status:x.status,score:x.score,maximumScore:x.maximumScore,submittedAt:x.submittedAt,studentRef:"student-"+x.assignment.student.id,exam:x.assignment.examVersion.exam.title}))};summary="read "+rows.length+" exam results";break;
        }
        case "create_announcement": {
          if(!scope(key,"announcements:write"))return res.json(rpcError(id,-32003,"Missing announcements:write scope."));
          const input=z.object({title:z.string().trim().min(2).max(160),message:z.string().trim().min(1).max(5000),expiresAt:z.string().datetime().optional()}).parse(args);
          const announcement=await db.announcement.create({data:{title:input.title,message:input.message,createdById:key.userId,...(input.expiresAt?{expiresAt:new Date(input.expiresAt)}:{})},select:{id:true,title:true,startsAt:true,expiresAt:true}});
          output={announcement};summary="created announcement";break;
        }
        case "read_mcp_audit": {
          if(!scope(key,"activity:read"))return res.json(rpcError(id,-32003,"Missing activity:read scope."));
          const input=z.object({limit:z.number().int().min(1).max(100).default(50)}).parse(args);
          output={logs:await db.adminMcpAuditLog.findMany({take:input.limit,orderBy:{createdAt:"desc"},select:{id:true,actorId:true,tool:true,success:true,summary:true,createdAt:true}})};summary="read audit log";break;
        }
        case "list_registered_models": {
          if (!scope(key, "models:read")) return res.json(rpcError(id, -32003, "Missing models:read scope."));
          const input = z.object({ modelId: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/).optional(), limit: z.number().int().min(1).max(100).default(50) }).parse(args);
          const rows = await db.registeredModel.findMany({ where: input.modelId ? { modelId: input.modelId } : {}, take: input.limit, orderBy: [{ modelId: "asc" }, { version: "desc" }] });
          output = { models: rows.map(row => ({ id: row.id, modelId: row.modelId, version: row.version, algorithm: row.algorithm, task: row.task, dataset: row.dataset, trainingDatasetId: row.trainingDatasetId, artifact: safeArtifactJson(row.artifactJson), active: row.isActive, createdAt: row.createdAt, activatedAt: row.activatedAt })) };
          summary = "listed " + rows.length + " model versions"; break;
        }
        case "create_model_dataset": {
          if (!scope(key, "models:dataset:create")) return res.json(rpcError(id, -32003, "Missing models:dataset:create scope."));
          const valueSchema = z.union([z.string().max(5000), z.number().finite(), z.boolean()]);
          const input = z.object({
            name: z.string().trim().min(2).max(100),
            task: z.enum(["classification", "regression"]),
            targetColumn: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
            targetType: z.enum(["string", "number"]),
            featureSchema: z.array(z.object({ name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), type: z.enum(["string", "number", "boolean"]) })).min(1).max(32),
            samples: z.array(z.record(z.string(), valueSchema)).min(1).max(500),
            sourceDescription: z.string().trim().min(8).max(1000),
            sourceAttested: z.boolean().default(false),
            confirmSourceAttestation: z.boolean().default(false),
            datasetKind: z.enum(["training", "validation", "verification", "synthetic"]),
          }).parse(args);
          if (input.task === "regression" && input.targetType !== "number") return res.json(rpcError(id, -32602, "Regression target must be numeric."));
          if (input.sourceAttested && !input.confirmSourceAttestation) return res.json(rpcError(id, -32002, "Explicitly confirm source attestation before marking a dataset attested."));
          const featureNames = input.featureSchema.map(feature => feature.name);
          if (new Set(featureNames).size !== featureNames.length || featureNames.includes(input.targetColumn)) return res.json(rpcError(id, -32602, "Feature names must be unique and must not contain the target column."));
          const sensitiveColumn = (name: string) => /(?:studentid|userid|email|phone|name|address|ipaddress|password|token|freetext|rawanswer|answertext)/.test(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
          if ([...featureNames, input.targetColumn].some(sensitiveColumn)) return res.json(rpcError(id, -32602, "Dataset columns must not contain direct student identifiers or raw personal/free-text fields; use de-identified aggregate features."));
          const expectedKeys = [...featureNames, input.targetColumn].sort();
          for (let index = 0; index < input.samples.length; index++) {
            const row = input.samples[index];
            if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(expectedKeys)) return res.json(rpcError(id, -32602, "Every row must contain exactly the declared feature columns and target."));
            for (const feature of input.featureSchema) {
              const value = row[feature.name];
              if (typeof value !== feature.type || (typeof value === "number" && !Number.isFinite(value))) return res.json(rpcError(id, -32602, "Row " + index + " has an invalid value for feature " + feature.name + "."));
            }
            const target = row[input.targetColumn];
            if (typeof target !== input.targetType || (typeof target === "number" && !Number.isFinite(target))) return res.json(rpcError(id, -32602, "Row " + index + " has an invalid target value."));
          }
          const samplesJson = stableJson(input.samples);
          if (Buffer.byteLength(samplesJson, "utf8") > 1_500_000) return res.json(rpcError(id, -32602, "Dataset payload exceeds the 1.5 MB limit."));
          const schemaJson = stableJson({ features: input.featureSchema, targetColumn: input.targetColumn, targetType: input.targetType });
          const fingerprint = sha(stableJson({ task: input.task, schema: JSON.parse(schemaJson), samples: JSON.parse(samplesJson) }));
          const dataset = await db.modelDataset.create({ data: { id: modelAuditId(), createdById: key.userId, name: input.name, task: input.task, targetColumn: input.targetColumn, featureSchemaJson: schemaJson, samplesJson, rowCount: input.samples.length, sourceDescription: input.sourceDescription, sourceAttested: input.sourceAttested, datasetKind: input.datasetKind, fingerprint }, select: { id: true, name: true, task: true, targetColumn: true, rowCount: true, sourceAttested: true, datasetKind: true, fingerprint: true, createdAt: true } });
          output = { dataset }; summary = "created " + input.datasetKind + " dataset with " + input.samples.length + " rows"; break;
        }
        case "get_model_verification_data": {
          if (!scope(key, "models:verification:read")) return res.json(rpcError(id, -32003, "Missing models:verification:read scope."));
          const input = z.object({ datasetId: z.string().min(1), offset: z.number().int().min(0).max(10000).default(0), limit: z.number().int().min(1).max(100).default(50) }).parse(args);
          const dataset = await db.modelDataset.findUnique({ where: { id: input.datasetId } });
          if (!dataset || dataset.datasetKind !== "verification" || !dataset.sourceAttested) return res.json(rpcError(id, -32004, "An attested verification dataset was not found."));
          const samples = JSON.parse(dataset.samplesJson) as unknown[];
          output = { dataset: { id: dataset.id, name: dataset.name, task: dataset.task, targetColumn: dataset.targetColumn, featureSchema: JSON.parse(dataset.featureSchemaJson), rowCount: dataset.rowCount, fingerprint: dataset.fingerprint }, offset: input.offset, rows: samples.slice(input.offset, input.offset + input.limit), hasMore: input.offset + input.limit < samples.length };
          summary = "read verification dataset page " + input.offset; break;
        }
        case "queue_model_training": {
          if (!scope(key, "models:train")) return res.json(rpcError(id, -32003, "Missing models:train scope."));
          const input = z.object({ datasetId: z.string().min(1), modelId: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/), seed: z.number().int().min(0).max(1000000).default(42), epochs: z.number().int().min(1).max(200).default(80), batchSize: z.number().int().min(1).max(512).default(32), confirm: z.literal(true) }).parse(args);
          const dataset = await db.modelDataset.findUnique({ where: { id: input.datasetId } });
          if (!dataset || !["training", "synthetic"].includes(dataset.datasetKind)) return res.json(rpcError(id, -32002, "Training requires a training or synthetic dataset; verification data cannot be used for training."));
          const job = await db.modelTrainingJob.create({ data: { id: modelAuditId(), datasetId: dataset.id, createdById: key.userId, modelId: input.modelId, seed: input.seed, epochs: input.epochs, batchSize: input.batchSize, status: "QUEUED", progress: 0 }, select: { id: true, datasetId: true, modelId: true, status: true, progress: true, seed: true, epochs: true, batchSize: true, createdAt: true } });
          output = { job, note: "Job queued. A configured training worker must claim it before training starts." }; summary = "queued model training job " + job.id; break;
        }
        case "list_model_training_jobs": {
          if (!scope(key, "models:read")) return res.json(rpcError(id, -32003, "Missing models:read scope."));
          const input = z.object({ limit: z.number().int().min(1).max(100).default(50) }).parse(args);
          const jobs = await db.modelTrainingJob.findMany({ where: { createdById: key.userId }, take: input.limit, orderBy: { createdAt: "desc" }, select: { id: true, datasetId: true, modelId: true, status: true, progress: true, errorMessage: true, workerId: true, leaseExpiresAt: true, resultJson: true, createdAt: true, startedAt: true, completedAt: true, updatedAt: true } });
          output = { jobs: jobs.map(job => ({ ...job, result: safeArtifactJson(job.resultJson), resultJson: undefined })) }; summary = "listed " + jobs.length + " training jobs"; break;
        }
        case "register_model_version": {
          if (!scope(key, "models:register")) return res.json(rpcError(id, -32003, "Missing models:register scope."));
          const input = z.object({ modelId: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/), version: z.number().int().min(1), algorithm: z.enum(["random_forest","gradient_boosting","logistic_regression","linear_regression","xgboost","pytorch","custom"]), task: z.enum(["classification","regression"]), datasetId: z.string().min(1), artifactUri: z.string().regex(/^(https:\/\/[^\s]+|r2:\/\/[A-Za-z0-9._/-]+)$/), sha256: z.string().regex(/^[a-fA-F0-9]{64}$/), framework: z.string().max(80).default("unknown"), inputSchema: z.record(z.string(), z.unknown()).default({}), outputSchema: z.record(z.string(), z.unknown()).default({}), confirm: z.literal(true) }).parse(args);
          const dataset = await db.modelDataset.findUnique({ where: { id: input.datasetId } });
          if (!dataset || dataset.task !== input.task || !["training","synthetic"].includes(dataset.datasetKind)) return res.json(rpcError(id, -32002, "Model task must match a training/synthetic dataset."));
          const artifact = { uri: input.artifactUri, sha256: input.sha256.toLowerCase(), framework: input.framework, inputSchema: input.inputSchema, outputSchema: input.outputSchema };
          const model = await db.registeredModel.create({ data: { id: modelAuditId(), modelId: input.modelId, version: input.version, algorithm: input.algorithm, task: input.task, dataset: dataset.name, trainingDatasetId: dataset.id, artifactJson: stableJson(artifact), isActive: false }, select: { id: true, modelId: true, version: true, algorithm: true, task: true, dataset: true, trainingDatasetId: true, createdAt: true } });
          await db.modelRegistryAudit.create({ data: { id: modelAuditId(), actorId: key.userId, modelId: model.modelId, version: model.version, action: "REGISTERED", details: stableJson({ datasetId: dataset.id, sha256: artifact.sha256 }) } });
          output = { model, status: "CANDIDATE_NOT_ACTIVE" }; summary = "registered candidate model version " + model.modelId + "@" + model.version; break;
        }
        case "record_model_evaluation": {
          if (!scope(key, "models:evaluate")) return res.json(rpcError(id, -32003, "Missing models:evaluate scope."));
          const metricsSchema = z.object({ accuracy: z.number().min(0).max(1).optional(), baselineAccuracy: z.number().min(0).max(1).optional(), mae: z.number().min(0).max(1e9).optional(), baselineMae: z.number().min(0).max(1e9).optional(), precision: z.number().min(0).max(1).optional(), recall: z.number().min(0).max(1).optional(), f1: z.number().min(0).max(1).optional(), rmse: z.number().min(0).max(1e9).optional() });
          const input = z.object({ modelId: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/), candidateVersion: z.number().int().min(1), baselineVersion: z.number().int().min(1), datasetId: z.string().min(1), sampleCount: z.number().int().min(1), metrics: metricsSchema, confirm: z.literal(true) }).parse(args);
          if (input.candidateVersion === input.baselineVersion) return res.json(rpcError(id, -32602, "Candidate and baseline versions must differ."));
          const [candidate, baseline, dataset] = await Promise.all([
            db.registeredModel.findUnique({ where: { modelId_version: { modelId: input.modelId, version: input.candidateVersion } } }),
            db.registeredModel.findUnique({ where: { modelId_version: { modelId: input.modelId, version: input.baselineVersion } } }),
            db.modelDataset.findUnique({ where: { id: input.datasetId } }),
          ]);
          if (!candidate || !baseline || !dataset || dataset.datasetKind !== "verification" || !dataset.sourceAttested || candidate.task !== baseline.task || candidate.task !== dataset.task) return res.json(rpcError(id, -32002, "Candidate, baseline, and attested verification dataset must exist and have matching tasks."));
          if (input.sampleCount !== dataset.rowCount) return res.json(rpcError(id, -32602, "Evaluation sampleCount must equal the verification dataset row count."));
          const metrics = input.metrics;
          let passed = false;
          if (candidate.task === "classification") {
            if (metrics.accuracy === undefined || metrics.baselineAccuracy === undefined) return res.json(rpcError(id, -32602, "Classification evaluation requires accuracy and baselineAccuracy."));
            passed = metrics.accuracy >= metrics.baselineAccuracy;
          } else {
            if (metrics.mae === undefined || metrics.baselineMae === undefined) return res.json(rpcError(id, -32602, "Regression evaluation requires mae and baselineMae."));
            passed = metrics.mae <= metrics.baselineMae;
          }
          const evaluation = await db.modelEvaluation.create({ data: { id: modelAuditId(), actorId: key.userId, modelId: input.modelId, candidateVersion: input.candidateVersion, baselineVersion: input.baselineVersion, datasetId: dataset.id, evaluationDataset: dataset.name, datasetFingerprint: dataset.fingerprint, sampleCount: input.sampleCount, metricsJson: stableJson(metrics), status: passed ? "PASSED" : "FAILED" }, select: { id: true, modelId: true, candidateVersion: true, baselineVersion: true, datasetId: true, sampleCount: true, status: true, evaluatedAt: true } });
          await db.modelRegistryAudit.create({ data: { id: modelAuditId(), actorId: key.userId, modelId: input.modelId, version: input.candidateVersion, action: "EVALUATED", details: stableJson({ evaluationId: evaluation.id, datasetId: dataset.id, status: evaluation.status }) } });
          output = { evaluation, primaryMetric: candidate.task === "classification" ? "accuracy" : "mae", note: "Metrics are admin-attested; this MCP tool records them but does not run model inference." }; summary = "recorded model evaluation " + evaluation.status; break;
        }
        case "evaluate_registered_model": {
          if (!scope(key, "models:evaluate")) return res.json(rpcError(id, -32003, "Missing models:evaluate scope."));
          const input = z.object({
            modelId: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
            candidateVersion: z.number().int().min(1),
            baselineVersion: z.number().int().min(1),
            datasetId: z.string().min(1),
            confirm: z.literal(true),
          }).parse(args);
          if (input.candidateVersion === input.baselineVersion) return res.json(rpcError(id, -32602, "Candidate and baseline versions must differ."));
          const [candidate, baseline, dataset] = await Promise.all([
            db.registeredModel.findUnique({ where: { modelId_version: { modelId: input.modelId, version: input.candidateVersion } } }),
            db.registeredModel.findUnique({ where: { modelId_version: { modelId: input.modelId, version: input.baselineVersion } } }),
            db.modelDataset.findUnique({ where: { id: input.datasetId } }),
          ]);
          if (!candidate || !baseline || !dataset) return res.json(rpcError(id, -32004, "Candidate, baseline, or verification dataset was not found."));
          if (dataset.datasetKind !== "verification" || !dataset.sourceAttested || candidate.task !== baseline.task || candidate.task !== dataset.task) {
            return res.json(rpcError(id, -32002, "Candidate, baseline, and attested verification dataset must have matching tasks."));
          }
          const candidateMetadata = JSON.parse(candidate.artifactJson) as { sha256?: unknown; modelArtifact?: unknown };
          const baselineMetadata = JSON.parse(baseline.artifactJson) as { sha256?: unknown; modelArtifact?: unknown };
          if (typeof candidateMetadata.sha256 !== "string" || !candidateMetadata.modelArtifact ||
              sha(stableJson(candidateMetadata.modelArtifact)) !== candidateMetadata.sha256 ||
              typeof baselineMetadata.sha256 !== "string" || !baselineMetadata.modelArtifact ||
              sha(stableJson(baselineMetadata.modelArtifact)) !== baselineMetadata.sha256) {
            return res.json(rpcError(id, -32002, "Automated evaluation requires checksum-valid native model artifacts."));
          }
          const rows = JSON.parse(dataset.samplesJson) as Record<string, unknown>[];
          if (rows.length !== dataset.rowCount) return res.json(rpcError(id, -32602, "Verification dataset row count does not match its stored metadata."));
          const metrics = evaluateModelArtifacts(candidateMetadata.modelArtifact, baselineMetadata.modelArtifact, rows, dataset.targetColumn, candidate.task as "classification" | "regression");
          const passed = candidate.task === "classification"
            ? metrics.accuracy >= metrics.baselineAccuracy
            : metrics.mae <= metrics.baselineMae;
          const evaluation = await db.modelEvaluation.create({
            data: {
              id: modelAuditId(),
              actorId: key.userId,
              modelId: input.modelId,
              candidateVersion: input.candidateVersion,
              baselineVersion: input.baselineVersion,
              datasetId: dataset.id,
              evaluationDataset: dataset.name,
              datasetFingerprint: dataset.fingerprint,
              sampleCount: dataset.rowCount,
              metricsJson: stableJson(metrics),
              status: passed ? "PASSED" : "FAILED",
            },
            select: { id: true, modelId: true, candidateVersion: true, baselineVersion: true, datasetId: true, sampleCount: true, status: true, evaluatedAt: true },
          });
          await db.modelRegistryAudit.create({
            data: {
              id: modelAuditId(),
              actorId: key.userId,
              modelId: input.modelId,
              version: input.candidateVersion,
              action: "EVALUATED",
              details: stableJson({ evaluationId: evaluation.id, datasetId: dataset.id, status: evaluation.status, metrics }),
            },
          });
          output = { evaluation, metrics, primaryMetric: candidate.task === "classification" ? "accuracy" : "mae", note: "Metrics were computed from candidate and baseline predictions on the attested verification dataset." };
          summary = "computed model evaluation " + evaluation.status;
          break;
        }
        case "activate_model_version": {
          if (!scope(key, "models:activate")) return res.json(rpcError(id, -32003, "Missing models:activate scope."));
          const input = z.object({ modelId: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/), version: z.number().int().min(1), confirm: z.literal(true) }).parse(args);
          const candidate = await db.registeredModel.findUnique({ where: { modelId_version: { modelId: input.modelId, version: input.version } } });
          if (!candidate) return res.json(rpcError(id, -32004, "Registered model version not found."));
          const passing = await db.modelEvaluation.findFirst({ where: { modelId: input.modelId, candidateVersion: input.version, status: "PASSED" }, orderBy: { evaluatedAt: "desc" } });
          const verifiedDataset = passing ? await db.modelDataset.findUnique({ where: { id: passing.datasetId } }) : null;
          if (!passing || !verifiedDataset || verifiedDataset.datasetKind !== "verification" || !verifiedDataset.sourceAttested) return res.json(rpcError(id, -32002, "Activation requires a passing evaluation on an attested verification dataset."));
          await db.$transaction(async tx => {
            await tx.registeredModel.updateMany({ where: { modelId: input.modelId, isActive: true }, data: { isActive: false } });
            await tx.registeredModel.update({ where: { id: candidate.id }, data: { isActive: true, activatedAt: new Date() } });
            await tx.modelRegistryAudit.create({ data: { id: modelAuditId(), actorId: key.userId, modelId: input.modelId, version: input.version, action: "ACTIVATED", details: stableJson({ evaluationId: passing.id, verificationDatasetId: verifiedDataset.id }) } });
          });
          output = { modelId: input.modelId, activeVersion: input.version, assignment: "active registry version", note: "This sets the active registry version. Feature inference must be wired to read this registry before student-facing behavior changes." }; summary = "activated model " + input.modelId + " version " + input.version; break;
        }
        default:return res.json(rpcError(id,-32602,"Unknown tool."));
      }
      success=true;
      return res.json(rpcResult(id,output));
    } catch(error) {
      const message=error instanceof z.ZodError?error.issues.map(issue=>issue.message).join("; "):"Tool request failed.";
      return res.json({jsonrpc:"2.0",id,result:{content:[{type:"text",text:message}],isError:true}});
    } finally {
      await db.adminMcpAuditLog.create({data:{actorId:key.userId,tool:String(params.name).slice(0,80),success,summary:summary.slice(0,300)}}).catch(()=>undefined);
    }
  });
  return router;
}
