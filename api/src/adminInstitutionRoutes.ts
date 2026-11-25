import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { requireAdmin, requireAuth } from "./auth.js";

const QuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  branch: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

function normalized(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase().replace(/\\s+/g, " ");
}

/**
 * Institution directory is derived from registered academic profiles instead
 * of maintaining a second source of truth. Custom college names/codes remain
 * valid and naturally appear as soon as students register.
 */
export function adminInstitutionRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/admin/institutions", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const query = QuerySchema.parse(req.query);
      const users = await db.user.findMany({
        where: {
          role: "STUDENT",
          accessStatus: { not: "REJECTED" },
          OR: [
            { collegeName: { not: null } },
            { collegeCode: { not: null } },
          ],
        },
        select: {
          collegeName: true,
          collegeCode: true,
          branchName: true,
          branchCode: true,
        },
        orderBy: [{ collegeName: "asc" }, { collegeCode: "asc" }],
        take: 10000,
      });

      const directory = new Map<string, {
        collegeName: string;
        collegeCode: string;
        studentCount: number;
        branches: Map<string, { name: string; code: string; studentCount: number }>;
      }>();

      for (const user of users) {
        const collegeName = (user.collegeName ?? "").trim();
        const collegeCode = (user.collegeCode ?? "").trim();
        if (!collegeName && !collegeCode) continue;
        const key = normalized(collegeCode) + "::" + normalized(collegeName);
        let college = directory.get(key);
        if (!college) {
          college = { collegeName, collegeCode, studentCount: 0, branches: new Map() };
          directory.set(key, college);
        }
        college.studentCount += 1;
        const branchName = (user.branchName ?? "").trim();
        const branchCode = (user.branchCode ?? "").trim();
        if (branchName || branchCode) {
          const branchKey = normalized(branchCode) + "::" + normalized(branchName);
          const current = college.branches.get(branchKey) ?? {
            name: branchName, code: branchCode, studentCount: 0,
          };
          current.studentCount += 1;
          college.branches.set(branchKey, current);
        }
      }

      const q = normalized(query.q);
      const branchFilter = normalized(query.branch);
      const rows = [...directory.values()]
        .filter((college) => {
          const collegeMatches = !q ||
            normalized(college.collegeName).includes(q) ||
            normalized(college.collegeCode).includes(q);
          if (!collegeMatches) return false;
          return !branchFilter || [...college.branches.values()].some((branch) =>
            normalized(branch.name).includes(branchFilter) ||
            normalized(branch.code).includes(branchFilter)
          );
        })
        .map((college) => {
          const branches = [...college.branches.values()]
            .filter((branch) => !branchFilter ||
              normalized(branch.name).includes(branchFilter) ||
              normalized(branch.code).includes(branchFilter))
            .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
          return {
            collegeName: college.collegeName,
            collegeCode: college.collegeCode,
            studentCount: college.studentCount,
            branchCount: college.branches.size,
            branches,
          };
        })
        .sort((a, b) => a.collegeName.localeCompare(b.collegeName) || a.collegeCode.localeCompare(b.collegeCode));

      const total = rows.length;
      const start = (query.page - 1) * query.limit;
      res.json({
        ok: true,
        institutions: rows.slice(start, start + query.limit),
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
