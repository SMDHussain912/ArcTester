import { createHash, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";

type AuditRequest = Request & { user?: { id: number; email: string } };
type Classified = { action: string; resourceType: string; resourceId: string; subjectIdFromPath?: number };
type AuditHashFields = {
  id: string; actorId: number | null; actorRole: string; subjectUserId: number | null;
  action: string; outcome: string; resourceType: string; resourceId: string; requestId: string;
  route: string; collegeCode: string; branchCode: string; contextJson: string; createdAt: Date; previousHash: string;
};
export type AuditWrite = Omit<Prisma.AuditEventUncheckedCreateInput, "id" | "createdAt" | "previousHash" | "eventHash"> & { id?: string; createdAt?: Date };

// Track finish-hook writes so test/server shutdown can drain audit persistence before DB teardown.
const pendingAuditWrites = new WeakMap<PrismaClient, Set<Promise<void>>>();
export async function flushAuditEvents(db: PrismaClient): Promise<void> {
  const pending = pendingAuditWrites.get(db);
  if (pending?.size) await Promise.allSettled([...pending]);
}

type CheckpointHashFields = { id: string; lastEventHash: string; lastEventCreatedAt: Date; deletedCount: number; previousCheckpointHash: string; createdAt: Date };
export function computeAuditCheckpointHash(checkpoint: CheckpointHashFields): string {
  const canonical = { id: checkpoint.id, lastEventHash: checkpoint.lastEventHash, lastEventCreatedAt: checkpoint.lastEventCreatedAt.toISOString(), deletedCount: checkpoint.deletedCount, previousCheckpointHash: checkpoint.previousCheckpointHash, createdAt: checkpoint.createdAt.toISOString() };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function computeAuditEventHash(event: AuditHashFields): string {
  const canonical = {
    id: event.id, actorId: event.actorId, actorRole: event.actorRole, subjectUserId: event.subjectUserId,
    action: event.action, outcome: event.outcome, resourceType: event.resourceType, resourceId: event.resourceId,
    requestId: event.requestId, route: event.route, collegeCode: event.collegeCode, branchCode: event.branchCode,
    contextJson: event.contextJson, createdAt: event.createdAt.toISOString(), previousHash: event.previousHash,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Prunes expired audit detail and writes a chained checkpoint in the same locked transaction. */
export async function pruneAuditEvents(db: PrismaClient, retentionDays: number, now = new Date()) {
  if (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 3650) throw new Error("AUDIT_RETENTION_DAYS must be an integer from 30 to 3650.");
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const sessionCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(73198412)`;
    // Login history contains email, masked IP and user-agent metadata. Apply the
    // same configured retention window as audit events.
    const loginEventsDeletedCount = (await tx.loginEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
    // Keep recent session history for account security; remove stale expired or
    // revoked session records after 90 days.
    const authSessionsDeletedCount = (await tx.authSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] },
    })).count;
    const where = { createdAt: { lt: cutoff } };
    const deletedCount = await tx.auditEvent.count({ where });
    if (!deletedCount) return { deletedCount: 0, loginEventsDeletedCount, authSessionsDeletedCount, cutoff: cutoff.toISOString(), retentionDays };
    const last = await tx.auditEvent.findFirst({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { eventHash: true, createdAt: true } });
    if (!last) return { deletedCount: 0, loginEventsDeletedCount, authSessionsDeletedCount, cutoff: cutoff.toISOString(), retentionDays };
    const previous = await tx.auditCheckpoint.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { checkpointHash: true, createdAt: true } });
    const id = randomUUID();
    const createdAt = new Date(Math.max(now.getTime(), last.createdAt.getTime() + 1, (previous?.createdAt.getTime() ?? 0) + 1));
    const fields = { id, lastEventHash: last.eventHash, lastEventCreatedAt: last.createdAt, deletedCount, previousCheckpointHash: previous?.checkpointHash ?? "GENESIS", createdAt };
    const checkpointHash = computeAuditCheckpointHash(fields);
    await tx.auditCheckpoint.create({ data: { ...fields, checkpointHash } });
    const deleted = await tx.auditEvent.deleteMany({ where });
    return { deletedCount: deleted.count, loginEventsDeletedCount, authSessionsDeletedCount, cutoff: cutoff.toISOString(), retentionDays, checkpointId: id, checkpointHash };
  }, { timeout: 30000 });
}

/** Appends events in a globally serialized, monotonic hash chain shared by all API instances. */
export async function writeAuditEvent(db: PrismaClient, input: AuditWrite) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(73198412)`;
    const latest = await tx.auditEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { eventHash: true, createdAt: true } });
    let createdAt = input.createdAt ?? new Date();
    if (latest && createdAt.getTime() <= latest.createdAt.getTime()) createdAt = new Date(latest.createdAt.getTime() + 1);
    const id = input.id ?? randomUUID();
    const previousHash = latest?.eventHash ?? "GENESIS";
    const fields: AuditHashFields = {
      id, actorId: input.actorId ?? null, actorRole: input.actorRole ?? "UNKNOWN", subjectUserId: input.subjectUserId ?? null,
      action: input.action, outcome: input.outcome, resourceType: input.resourceType ?? "", resourceId: input.resourceId ?? "",
      requestId: input.requestId, route: input.route, collegeCode: input.collegeCode ?? "", branchCode: input.branchCode ?? "",
      contextJson: input.contextJson ?? "{}", createdAt, previousHash,
    };
    const eventHash = computeAuditEventHash(fields);
    return tx.auditEvent.create({ data: { ...input, ...fields, id, createdAt, previousHash, eventHash } });
  });
}

function classify(method: string, path: string, status: number): Classified | null {
  const upper = method.toUpperCase();
  if (/^\/(?:auth\/)?profile$/.test(path) && upper === "PATCH") return { action: "STUDENT_PROFILE_CHANGE", resourceType: "STUDENT", resourceId: "" };
  if (/^\/(?:auth\/)?logout$/.test(path) || (/^\/(?:auth\/)?sessions\/(?:revoke-all|[^/]+)/i.test(path) && upper !== "GET")) return { action: "SESSION_REVOKED", resourceType: "SESSION", resourceId: "" };
  if (/^\/(?:auth\/)?(?:change-password|devices|invitations)/i.test(path) && upper !== "GET") return { action: "AUTHENTICATION_SECURITY_CHANGE", resourceType: "AUTH", resourceId: "" };
  if (/^\/(?:auth\/)?passkeys\/login\//i.test(path)) return { action: status < 400 ? "PASSKEY_LOGIN" : "PASSKEY_LOGIN_FAILURE", resourceType: "AUTH", resourceId: "" };
  if (/^\/(?:auth\/)?(?:login|signin|sign-in|verify|totp|2fa|passkey)/i.test(path)) {
    return { action: /login|signin|sign-in/i.test(path) ? (status < 400 ? "LOGIN" : "LOGIN_FAILURE") : "AUTHENTICATION_SECURITY_CHANGE", resourceType: "AUTH", resourceId: "" };
  }
  const student = path.match(/^\/admin\/students\/(\d+)(?:\/(access))?$/);
  if (student) {
    const studentId = Number(student[1]);
    if (Number.isSafeInteger(studentId) && studentId > 0) {
      if (student[2]) return { action: "STUDENT_APPROVAL", resourceType: "STUDENT", resourceId: String(studentId), subjectIdFromPath: studentId };
      if (upper === "DELETE") return { action: "STUDENT_ACCOUNT_ANONYMIZED", resourceType: "STUDENT", resourceId: String(studentId), subjectIdFromPath: studentId };
      if (upper === "PATCH") return { action: "STUDENT_PROFILE_CHANGE", resourceType: "STUDENT", resourceId: String(studentId), subjectIdFromPath: studentId };
    }
  }
  if (/^\/admin\/students\/access\/bulk$/.test(path)) return { action: "STUDENT_APPROVAL_BULK", resourceType: "STUDENT", resourceId: "bulk" };
  if (/^\/(?:auth\/)?(?:sessions|session)/i.test(path) || /^\/sessions/i.test(path)) return { action: /revoke|delete/i.test(path) || upper === "DELETE" ? "SESSION_REVOKED" : "SESSION_ACTIVITY", resourceType: "SESSION", resourceId: "" };
  if (/lesson/i.test(path) && /(complete|progress|finish|submit)/i.test(path)) return { action: "LESSON_COMPLETION", resourceType: "LESSON", resourceId: path.match(/\/(?:lessons?|lesson-packages?)\/([^/]+)/i)?.[1] ?? "" };
  if (/^\/path\/(?:lessons\/[^/]+\/answer|units\/[^/]+\/test\/answer)/i.test(path)) return { action: "QUESTION_ACTIVITY", resourceType: "LEARNING_PATH_QUESTION", resourceId: path.match(/\/lessons?\/([^/]+)/i)?.[1] ?? path.match(/\/units?\/([^/]+)/i)?.[1] ?? "" };
  if (/^\/path\/units\/[^/]+\/test\/complete/i.test(path)) return { action: "EXAM_SUBMIT", resourceType: "UNIT_TEST", resourceId: path.match(/\/units?\/([^/]+)/i)?.[1] ?? "" };
  if (/lesson/i.test(path) && upper === "GET") return { action: "LESSON_ACCESS", resourceType: "LESSON", resourceId: path.match(/\/(?:lessons?|lesson-packages?)\/([^/]+)/i)?.[1] ?? "" };
  if (/question/i.test(path) && !/^\/admin\//.test(path)) return { action: "QUESTION_ACTIVITY", resourceType: "QUESTION", resourceId: path.match(/\/questions?\/([^/]+)/i)?.[1] ?? "" };
  if (/^\/admin\/(?:questions|question-bank|subjects|topics|lesson-drafts|lessons|study-materials|materials|path|exams)(?:\/|$)/i.test(path) && upper !== "GET") return { action: "CONTENT_EDIT", resourceType: "CONTENT", resourceId: path.match(/^\/admin\/[^/]+\/([^/]+)/)?.[1] ?? "" };
  if (/exam|attempt|submission/i.test(path) && upper !== "GET") {
    const isSubmit = /submit|finish|complete|answer/i.test(path);
    return { action: isSubmit ? "EXAM_SUBMIT" : "EXAM_START", resourceType: "EXAM", resourceId: path.match(/\/(?:exams?|attempts?)\/([^/]+)/i)?.[1] ?? "" };
  }
  if (/^\/admin\//.test(path) && upper !== "GET") return { action: "ADMIN_OPERATION", resourceType: "ADMIN_RESOURCE", resourceId: path.match(/^\/admin\/[^/]+\/([^/]+)/)?.[1] ?? "" };
  if (/^\/(?:questions|question-bank|practice)/i.test(path)) return { action: "QUESTION_ACTIVITY", resourceType: "QUESTION", resourceId: "" };
  return null;
}
function safeRoute(path: string): string {
  return path.split("/").map(part => /^\d+$/.test(part) ? ":id" : /^[a-z0-9]{20,}$/i.test(part) ? ":resource" : part).join("/");
}

/** Captures route/action/outcome and server-resolved identity; never stores request bodies or auth material. */
export function auditRequestMiddleware(db: PrismaClient) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      const pending = (async () => {
        const auditReq = req as AuditRequest;
        const path = req.path;
        if (path === "/health" || path === "/ready") return;
        const classified = classify(req.method, path, res.statusCode);
        if (!classified) return;
        let actorId = auditReq.user?.id ?? null;
        let subjectUserId = classified.subjectIdFromPath ?? actorId;
        // Login identity is resolved from the account/challenge row; submitted identifiers are never stored.
        if (!actorId && (classified.action.startsWith("LOGIN") || classified.action.startsWith("PASSKEY_LOGIN"))) {
          const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
          if (email) {
            const matched = await db.user.findUnique({ where: { email }, select: { id: true } });
            subjectUserId = matched?.id ?? null;
          } else if (typeof req.body?.challengeId === "string") {
            const challengeHash = createHash("sha256").update(req.body.challengeId).digest("hex");
            const challenge = await db.authChallenge.findUnique({ where: { challenge: challengeHash }, select: { userId: true } });
            subjectUserId = challenge?.userId ?? null;
          }
          if (res.statusCode < 400 && subjectUserId) actorId = subjectUserId;
        }
        const identityId = subjectUserId ?? actorId;
        const [actor, subject] = await Promise.all([
          actorId ? db.user.findUnique({ where: { id: actorId }, select: { role: true } }) : Promise.resolve(null),
          identityId ? db.user.findUnique({ where: { id: identityId }, select: { collegeCode: true, branchCode: true } }) : Promise.resolve(null),
        ]);
        await writeAuditEvent(db, {
          actorId, actorRole: actor?.role ?? "UNKNOWN", subjectUserId,
          action: classified.action, outcome: res.statusCode < 400 ? "SUCCESS" : "FAILURE",
          resourceType: classified.resourceType, resourceId: classified.resourceId.slice(0, 120),
          requestId, route: safeRoute(path).slice(0, 240),
          collegeCode: subject?.collegeCode ?? "", branchCode: subject?.branchCode ?? "",
          contextJson: JSON.stringify({ method: req.method.toUpperCase(), statusCode: res.statusCode }),
        });
      })().catch(() => console.error("ArcTester audit event persistence failed"));
      let writes = pendingAuditWrites.get(db);
      if (!writes) { writes = new Set(); pendingAuditWrites.set(db, writes); }
      writes.add(pending);
      void pending.then(() => writes!.delete(pending));
    });
    next();
  };
}
