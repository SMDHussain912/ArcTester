import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";

type AuditRequest = Request & { user?: { id: number; email: string } };

type Classified = { action: string; resourceType: string; resourceId: string; subjectIdFromPath?: number };

function classify(method: string, path: string, status: number): Classified | null {
  const upper = method.toUpperCase();
  if (path === "/auth/profile" && upper === "PATCH") return { action: "STUDENT_PROFILE_CHANGE", resourceType: "STUDENT", resourceId: "" };
  if (/^\/auth\/(?:login|signin|sign-in|verify|totp|2fa|passkey)/i.test(path)) {
    return { action: /login|signin|sign-in/i.test(path) ? (status < 400 ? "LOGIN" : "LOGIN_FAILURE") : "AUTHENTICATION_SECURITY_CHANGE", resourceType: "AUTH" , resourceId: "" };
  }
  const student = path.match(/^\/admin\/students\/(\d+)(?:\/(access))?$/);
  if (student) {
    const studentId = Number(student[1]);
    if (Number.isSafeInteger(studentId) && studentId > 0) {
      if (student[2] || (upper === "PATCH" && /\/access\//.test(path))) return { action: "STUDENT_APPROVAL", resourceType: "STUDENT", resourceId: String(studentId), subjectIdFromPath: studentId };
      if (upper === "DELETE") return { action: "STUDENT_ACCOUNT_ANONYMIZED", resourceType: "STUDENT", resourceId: String(studentId), subjectIdFromPath: studentId };
      if (upper === "PATCH") return { action: "STUDENT_PROFILE_CHANGE", resourceType: "STUDENT", resourceId: String(studentId), subjectIdFromPath: studentId };
    }
  }
  if (/^\/admin\/students\/access\/bulk$/.test(path)) return { action: "STUDENT_APPROVAL_BULK", resourceType: "STUDENT", resourceId: "bulk" };
  if (/\/auth\/(?:sessions|session)|^\/sessions/i.test(path)) return { action: /revoke|delete/i.test(path) || upper === "DELETE" ? "SESSION_REVOKED" : "SESSION_ACTIVITY", resourceType: "SESSION", resourceId: "" };
  if (/lesson/i.test(path) && /(complete|progress|finish|submit)/i.test(path)) return { action: "LESSON_COMPLETION", resourceType: "LESSON", resourceId: path.match(/\/(?:lessons?|lesson-packages?)\/([^/]+)/i)?.[1] ?? "" };
  if (/lesson/i.test(path) && upper === "GET") return { action: "LESSON_ACCESS", resourceType: "LESSON", resourceId: path.match(/\/(?:lessons?|lesson-packages?)\/([^/]+)/i)?.[1] ?? "" };
  if (/question/i.test(path) && !/^\/admin\//.test(path)) return { action: "QUESTION_ACTIVITY", resourceType: "QUESTION", resourceId: path.match(/\/questions?\/([^/]+)/i)?.[1] ?? "" };
  if (/exam|attempt|submission/i.test(path) && upper !== "GET") {
    const isSubmit = /submit|finish|complete|answer/i.test(path);
    return { action: isSubmit ? "EXAM_SUBMIT" : "EXAM_START", resourceType: "EXAM", resourceId: path.match(/\/(?:exams?|attempts?)\/([^/]+)/i)?.[1] ?? "" };
  }
  if (/^\/admin\//.test(path) && upper !== "GET") return { action: "ADMIN_OPERATION", resourceType: "ADMIN_RESOURCE", resourceId: path.match(/^\/admin\/[^/]+\/([^/]+)/)?.[1] ?? "" };
  if (/^\/(?:questions|question-bank|practice)/i.test(path)) return { action: "QUESTION_ACTIVITY", resourceType: "QUESTION", resourceId: "" };
  return null;
}

function safeRoute(path: string): string {
  return path.split("/").map((part) => /^\d+$/.test(part) ? ":id" : /^[a-z0-9]{20,}$/i.test(part) ? ":resource" : part).join("/");
}

/**
 * Captures only route/action/outcome and server-resolved actor/subject identity.
 * It never persists request bodies, query strings, cookies, credentials, IPs or user agents.
 */
export function auditRequestMiddleware(db: PrismaClient) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      void (async () => {
        const auditReq = req as AuditRequest;
        const path = req.path;
        if (path === "/health" || path === "/ready") return;
        const classified = classify(req.method, path, res.statusCode);
        if (!classified) return;
        let actorId = auditReq.user?.id ?? null;
        let subjectUserId = classified.subjectIdFromPath ?? actorId;
        // Login identity is resolved from the database; the submitted email is never stored in the event.
        if (!actorId && classified.action.startsWith("LOGIN")) {
          const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
          if (email) {
            const matched = await db.user.findUnique({ where: { email }, select: { id: true } });
            subjectUserId = matched?.id ?? null;
            if (res.statusCode < 400 && matched) actorId = matched.id;
          }
        }
        const identityId = subjectUserId ?? actorId;
        const [actor, subject] = await Promise.all([
          actorId ? db.user.findUnique({ where: { id: actorId }, select: { role: true } }) : Promise.resolve(null),
          identityId ? db.user.findUnique({ where: { id: identityId }, select: { collegeCode: true, branchCode: true } }) : Promise.resolve(null),
        ]);
        await db.auditEvent.create({
          data: {
            actorId,
            actorRole: actor?.role ?? "UNKNOWN",
            subjectUserId,
            action: classified.action,
            outcome: res.statusCode < 400 ? "SUCCESS" : "FAILURE",
            resourceType: classified.resourceType,
            resourceId: classified.resourceId.slice(0, 120),
            requestId,
            route: safeRoute(path).slice(0, 240),
            collegeCode: subject?.collegeCode ?? "",
            branchCode: subject?.branchCode ?? "",
            contextJson: JSON.stringify({ method: req.method.toUpperCase(), statusCode: res.statusCode }),
          },
        });
      })().catch(() => {
        // Audit persistence failures must not leak request data or break a completed API response.
        console.error("ArcTester audit event persistence failed");
      });
    });
    next();
  };
}
