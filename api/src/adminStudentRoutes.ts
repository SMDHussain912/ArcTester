import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { StudentAcademicProfileSchema, requireAdmin, requireAuth } from "./auth.js";

const ListSchema = z.object({
  q: z.string().trim().max(120).optional(),
  college: z.string().trim().max(180).optional(),
  branch: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

const UpdateSchema = StudentAcademicProfileSchema.partial().extend({
  email: z.string().email().trim().toLowerCase().optional(),
  registrationNumber: z.preprocess((value) => value === "" ? null : value, z.string().trim().regex(/^\d{5}-[A-Z]{1,3}-\d{3}$/i, "Enter a valid diploma registration number.").nullable().optional()),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one field to update.",
});

export function adminStudentRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/admin/students", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = ListSchema.parse(req.query);
      const q = query.q?.trim();
      const users = await db.user.findMany({
        where: {
          role: "STUDENT",
          NOT: { email: { endsWith: ".deleted.invalid" } },
          ...(q ? { OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { collegeName: { contains: q, mode: "insensitive" } },
            { collegeCode: { contains: q, mode: "insensitive" } },
            { registrationNumber: { contains: q, mode: "insensitive" } },
            { registrationNumber: { contains: q, mode: "insensitive" } },
          ] } : {}),
          ...(query.college ? { collegeName: { contains: query.college, mode: "insensitive" } } : {}),
          ...(query.branch ? { branchName: { contains: query.branch, mode: "insensitive" } } : {}),
        },
        select: {
          id: true, email: true, fullName: true, collegeName: true, collegeCode: true,
          postalPin: true, branchName: true, branchCode: true, registrationNumber: true, accessStatus: true, createdAt: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      });
      const total = await db.user.count({
        where: {
          role: "STUDENT",
          NOT: { email: { endsWith: ".deleted.invalid" } },
          ...(q ? { OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { collegeName: { contains: q, mode: "insensitive" } },
            { collegeCode: { contains: q, mode: "insensitive" } },
          ] } : {}),
          ...(query.college ? { collegeName: { contains: query.college, mode: "insensitive" } } : {}),
          ...(query.branch ? { branchName: { contains: query.branch, mode: "insensitive" } } : {}),
        },
      });
      res.json({ ok: true, students: users, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) });
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
        select: { id: true, email: true, fullName: true, collegeName: true, collegeCode: true, postalPin: true, branchName: true, branchCode: true, accessStatus: true, createdAt: true },
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
