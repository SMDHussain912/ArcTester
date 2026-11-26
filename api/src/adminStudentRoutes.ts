import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { StudentAcademicProfileSchema, requireAdmin, requireAuth } from "./auth.js";

const ListSchema = z.object({
  q: z.string().trim().max(120).optional(),
  college: z.string().trim().max(180).optional(),
  branch: z.string().trim().max(120).optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

const UpdateSchema = StudentAcademicProfileSchema.partial().extend({
  email: z.string().email().trim().toLowerCase().optional(),
  registrationNumber: z.preprocess(
    (value) => value === "" ? null : value,
    z.string().trim().regex(/^\d{5}-[A-Z]{1,3}-\\d{3}$/i, "Enter a valid diploma registration number.").nullable().optional(),
  ),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one field to update.",
});
const AccessStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
const BulkApproveSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
}).strict();

export function adminStudentRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/admin/students", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = ListSchema.parse(req.query);
      const q = query.q?.trim();
      const baseWhere = {
        role: "STUDENT",
        NOT: { email: { endsWith: ".deleted.invalid" } },
        ...(q ? { OR: [
          { fullName: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
          { collegeName: { contains: q, mode: "insensitive" as const } },
          { collegeCode: { contains: q, mode: "insensitive" as const } },
          { registrationNumber: { contains: q, mode: "insensitive" as const } },
          { branchName: { contains: q, mode: "insensitive" as const } },
          { branchCode: { contains: q, mode: "insensitive" as const } },
        ] } : {}),
        ...(query.college ? { collegeName: { contains: query.college, mode: "insensitive" as const } } : {}),
        ...(query.branch ? { branchName: { contains: query.branch, mode: "insensitive" as const } } : {}),
      };
      const where = { ...baseWhere, ...(query.status ? { accessStatus: query.status } : {}) };
      const [students, total, pendingCount, approvedCount, rejectedCount] = await Promise.all([
        db.user.findMany({
          where,
          select: {
            id: true, email: true, fullName: true, collegeName: true, collegeCode: true,
            postalPin: true, branchName: true, branchCode: true, registrationNumber: true,
            accessStatus: true, createdAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        db.user.count({ where }),
        db.user.count({ where: { ...baseWhere, accessStatus: "PENDING" } }),
        db.user.count({ where: { ...baseWhere, accessStatus: "APPROVED" } }),
        db.user.count({ where: { ...baseWhere, accessStatus: "REJECTED" } }),
      ]);
      const statusCounts = { PENDING: pendingCount, APPROVED: approvedCount, REJECTED: rejectedCount };
      res.json({
        ok: true, students, page: query.page, limit: query.limit, total,
        totalPages: Math.ceil(total / query.limit), statusCounts,
      });
    } catch (error) { next(error); }
  });

  router.patch("/admin/students/access/bulk", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const input = BulkApproveSchema.parse(req.body);
      if (new Set(input.ids).size !== input.ids.length) return res.status(400).json({ error: "Student IDs must be unique." });
      const result = await db.user.updateMany({
        where: { id: { in: input.ids }, role: "STUDENT", accessStatus: "PENDING", NOT: { email: { endsWith: ".deleted.invalid" } } },
        data: { accessStatus: "APPROVED", sessionVersion: { increment: 1 } },
      });
      res.json({ ok: true, approvedCount: result.count });
    } catch (error) { next(error); }
  });

  router.patch("/admin/students/:id/access", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ error: "Invalid student ID." });
      const accessStatus = AccessStatusSchema.parse(req.body?.accessStatus);
      const existing = await db.user.findFirst({
        where: { id: id.data, role: "STUDENT", NOT: { email: { endsWith: ".deleted.invalid" } } },
        select: { id: true, accessStatus: true },
      });
      if (!existing) return res.status(404).json({ error: "Student not found." });
      const updated = await db.user.update({
        where: { id: id.data },
        data: {
          accessStatus,
          ...(accessStatus !== "APPROVED" || existing.accessStatus !== "APPROVED" ? { sessionVersion: { increment: 1 } } : {}),
        },
        select: { id: true, accessStatus: true },
      });
      res.json({ ok: true, student: updated });
    } catch (error) { next(error); }
  });

  router.patch("/admin/students/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ error: "Invalid student ID." });
      const input = UpdateSchema.parse(req.body);
      const existing = await db.user.findFirst({ where: { id: id.data, role: "STUDENT", NOT: { email: { endsWith: ".deleted.invalid" } } } });
      if (!existing) return res.status(404).json({ error: "Student not found." });
      const updated = await db.user.update({
        where: { id: id.data },
        data: input,
        select: {
          id: true, email: true, fullName: true, collegeName: true, collegeCode: true,
          postalPin: true, branchName: true, branchCode: true, registrationNumber: true,
          accessStatus: true, createdAt: true,
        },
      });
      res.json({ ok: true, student: updated });
    } catch (error) { next(error); }
  });

  router.delete("/admin/students/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.coerce.number().int().positive().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ error: "Invalid student ID." });
      const existing = await db.user.findFirst({ where: { id: id.data, role: "STUDENT", NOT: { email: { endsWith: ".deleted.invalid" } } }, select: { id: true } });
      if (!existing) return res.status(404).json({ error: "Student not found." });
      await db.user.update({
        where: { id: id.data },
        data: {
          email: `deleted-${id.data}-${randomUUID()}@account.deleted.invalid`,
          passwordHash: `deleted:${randomUUID()}`,
          fullName: "Deleted student",
          collegeName: null, collegeCode: null, postalPin: null, branchName: null, branchCode: null, registrationNumber: null,
          accessStatus: "REJECTED",
          sessionVersion: { increment: 1 },
        },
      });
      res.json({ ok: true, deleted: true, message: "Student account removed and personal profile anonymized. Linked academic records are retained." });
    } catch (error) { next(error); }
  });

  return router;
}
