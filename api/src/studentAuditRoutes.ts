import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { computeAuditEventHash, writeAuditEvent } from "./audit.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";

const FilterSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  outcome: z.enum(["SUCCESS", "FAILURE"]).optional(),
  collegeCode: z.string().trim().max(16).optional(),
  branchCode: z.string().trim().max(24).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

type AuditFilters = z.infer<typeof FilterSchema>;
function eventWhere(studentId: number, filters: AuditFilters): Prisma.AuditEventWhereInput {
  return {
    subjectUserId: studentId,
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.outcome ? { outcome: filters.outcome } : {}),
    ...(filters.collegeCode ? { collegeCode: filters.collegeCode } : {}),
    ...(filters.branchCode ? { branchCode: filters.branchCode } : {}),
    ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } } : {}),
  };
}
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  // Prevent spreadsheet formula injection for exported untrusted or user-derived text.
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function toCsv(events: Array<Record<string, unknown>>): string {
  const columns = ["id", "createdAt", "action", "outcome", "actorId", "actorRole", "resourceType", "resourceId", "requestId", "route", "collegeCode", "branchCode"];
  return [columns.join(","), ...events.map(event => columns.map(column => csvCell(event[column])).join(","))].join("\r\n") + "\r\n";
}

export function studentAuditRouter(db: PrismaClient): Router {
  const router = Router();
  router.get("/admin/audit/integrity", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const events = await db.auditEvent.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, actorId: true, actorRole: true, subjectUserId: true, action: true, outcome: true, resourceType: true, resourceId: true, requestId: true, route: true, collegeCode: true, branchCode: true, contextJson: true, createdAt: true, previousHash: true, eventHash: true },
      });
      let expectedPrevious = "GENESIS";
      let firstInvalidEventId: string | null = null;
      for (const event of events) {
        const hash = computeAuditEventHash(event);
        if (event.previousHash !== expectedPrevious || event.eventHash !== hash) {
          firstInvalidEventId = event.id;
          break;
        }
        expectedPrevious = event.eventHash;
      }
      const valid = firstInvalidEventId === null;
      await writeAuditEvent(db, { actorId: req.user!.id, actorRole: "ADMIN", subjectUserId: null, action: "AUDIT_INTEGRITY_CHECK", outcome: valid ? "SUCCESS" : "FAILURE", resourceType: "AUDIT_LOG", resourceId: "", requestId: randomUUID(), route: "/admin/audit/integrity", collegeCode: "", branchCode: "", contextJson: JSON.stringify({ checkedEvents: events.length, valid, firstInvalidEventId }) });
      res.json({ ok: true, valid, checkedEvents: events.length, firstInvalidEventId, checkedAt: new Date().toISOString() });
    } catch (error) { next(error); }
  });
  router.get("/admin/students/:id/audit", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const studentId = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!studentId.success) return res.status(400).json({ error: "Invalid student ID." });
      const filters = FilterSchema.parse(req.query);
      if (filters.from && filters.to && new Date(filters.from) > new Date(filters.to)) return res.status(400).json({ error: "The start date must be before the end date." });
      const student = await db.user.findFirst({ where: { id: studentId.data, role: "STUDENT" }, select: { id: true, fullName: true, email: true, collegeName: true, collegeCode: true, branchName: true, branchCode: true, registrationNumber: true, accessStatus: true } });
      if (!student) return res.status(404).json({ error: "Student not found." });
      const where = eventWhere(student.id, filters);
      const [events, total] = await Promise.all([
        db.auditEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (filters.page - 1) * filters.limit, take: filters.limit, select: { id: true, createdAt: true, action: true, outcome: true, actorId: true, actorRole: true, resourceType: true, resourceId: true, requestId: true, route: true, collegeCode: true, branchCode: true, contextJson: true } }),
        db.auditEvent.count({ where }),
      ]);
      await writeAuditEvent(db, { actorId: req.user!.id, actorRole: "ADMIN", subjectUserId: student.id, action: "AUDIT_TIMELINE_VIEW", outcome: "SUCCESS", resourceType: "STUDENT", resourceId: String(student.id), requestId: randomUUID(), route: "/admin/students/:id/audit", collegeCode: student.collegeCode ?? "", branchCode: student.branchCode ?? "", contextJson: JSON.stringify({ page: filters.page, limit: filters.limit, filters: { action: filters.action, outcome: filters.outcome, from: filters.from, to: filters.to } }) });
      res.json({ ok: true, student, events, page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) });
    } catch (error) { next(error); }
  });

  router.get("/admin/students/:id/audit/export", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const studentId = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!studentId.success) return res.status(400).json({ error: "Invalid student ID." });
      const filters = FilterSchema.omit({ page: true, limit: true }).extend({ format: z.enum(["csv", "json"]).default("csv"), limit: z.coerce.number().int().min(1).max(10000).default(5000) }).parse(req.query);
      if (filters.from && filters.to && new Date(filters.from) > new Date(filters.to)) return res.status(400).json({ error: "The start date must be before the end date." });
      const student = await db.user.findFirst({ where: { id: studentId.data, role: "STUDENT" }, select: { id: true, fullName: true, email: true, collegeName: true, collegeCode: true, branchName: true, branchCode: true, registrationNumber: true, accessStatus: true } });
      if (!student) return res.status(404).json({ error: "Student not found." });
      const { format, limit, ...filterValues } = filters;
      const where = eventWhere(student.id, { ...filterValues, page: 1, limit });
      const events = await db.auditEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit, select: { id: true, createdAt: true, action: true, outcome: true, actorId: true, actorRole: true, resourceType: true, resourceId: true, requestId: true, route: true, collegeCode: true, branchCode: true } });
      await writeAuditEvent(db, { actorId: req.user!.id, actorRole: "ADMIN", subjectUserId: student.id, action: "AUDIT_EXPORT", outcome: "SUCCESS", resourceType: "STUDENT", resourceId: String(student.id), requestId: randomUUID(), route: "/admin/students/:id/audit/export", collegeCode: student.collegeCode ?? "", branchCode: student.branchCode ?? "", contextJson: JSON.stringify({ format, filteredCount: events.length, filters: filterValues }) });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      if (format === "json") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="student-${student.id}-audit-${stamp}.json"`);
        return res.send(JSON.stringify({ studentId: student.id, exportedAt: new Date().toISOString(), count: events.length, filters: filterValues, events }, null, 2));
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="student-${student.id}-audit-${stamp}.csv"`);
      return res.send("\uFEFF" + toCsv(events as unknown as Array<Record<string, unknown>>));
    } catch (error) { next(error); }
  });
  return router;
}
