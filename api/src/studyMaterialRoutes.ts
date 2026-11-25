import express, { Router } from "express";
import { basename } from "node:path";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, notFound } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";
import { isContentAudienceVisible, type ContentAudience } from "./contentAudience.js";

const ExternalHttpsUrl = z.string().trim().url().max(2048).refine((value) => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}, "Study material links must be valid HTTPS URLs without embedded credentials.");

const AudienceTargetSchema = z.object({
  audienceScope: z.enum(["ALL", "COLLEGE", "BRANCH"]).default("ALL"),
  targetCollegeCode: z.string().trim().max(40).default(""),
  targetCollegeName: z.string().trim().max(160).default(""),
  targetBranchCode: z.string().trim().max(40).default(""),
  targetBranchName: z.string().trim().max(160).default(""),
});

function validateAudienceTarget(value: {
  audienceScope: "ALL" | "COLLEGE" | "BRANCH";
  targetCollegeCode?: string;
  targetCollegeName?: string;
  targetBranchCode?: string;
  targetBranchName?: string;
}, ctx: z.RefinementCtx) {
  if (value.audienceScope === "COLLEGE" && !value.targetCollegeCode?.trim() && !value.targetCollegeName?.trim()) {
    ctx.addIssue({ code: "custom", message: "Choose a college code or enter a college name.", path: ["targetCollegeName"] });
  }
  if (value.audienceScope === "BRANCH" && !value.targetBranchCode?.trim() && !value.targetBranchName?.trim()) {
    ctx.addIssue({ code: "custom", message: "Choose a branch code or enter a branch name.", path: ["targetBranchName"] });
  }
}

function audienceData(value: {
  audienceScope: "ALL" | "COLLEGE" | "BRANCH";
  targetCollegeCode?: string;
  targetCollegeName?: string;
  targetBranchCode?: string;
  targetBranchName?: string;
}) {
  return {
    audienceScope: value.audienceScope,
    targetCollegeCode: value.targetCollegeCode?.trim() || null,
    targetCollegeName: value.targetCollegeName?.trim() || null,
    targetBranchCode: value.targetBranchCode?.trim() || null,
    targetBranchName: value.targetBranchName?.trim() || null,
  };
}

const LinkFields = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1000).default(""),
  subject: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(100).default(""),
  url: ExternalHttpsUrl,
  ...AudienceTargetSchema.shape,
}).strict().superRefine(validateAudienceTarget);

const FileMetadata = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1000).default(""),
  subject: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(100).default(""),
  fileName: z.string().trim().min(1).max(180),
  ...AudienceTargetSchema.shape,
}).strict().superRefine(validateAudienceTarget);

const MaterialPatch = z.object({
  title: z.string().trim().min(2).max(140).optional(),
  description: z.string().trim().max(1000).optional(),
  subject: z.string().trim().min(1).max(80).optional(),
  topic: z.string().trim().max(100).optional(),
  url: z.string().trim().max(2048).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  audienceScope: z.enum(["ALL", "COLLEGE", "BRANCH"]).optional(),
  targetCollegeCode: z.string().trim().max(40).nullable().optional(),
  targetCollegeName: z.string().trim().max(160).nullable().optional(),
  targetBranchCode: z.string().trim().max(40).nullable().optional(),
  targetBranchName: z.string().trim().max(160).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) ctx.addIssue({ code: "custom", message: "Provide at least one field to update." });
  if (value.audienceScope === "COLLEGE" && !value.targetCollegeCode?.trim() && !value.targetCollegeName?.trim()) {
    ctx.addIssue({ code: "custom", message: "A college code or name is required for college-only content.", path: ["targetCollegeName"] });
  }
  if (value.audienceScope === "BRANCH" && !value.targetBranchCode?.trim() && !value.targetBranchName?.trim()) {
    ctx.addIssue({ code: "custom", message: "A branch code or name is required for branch-only content.", path: ["targetBranchName"] });
  }
});

const publicSelect = {
  id: true, title: true, description: true, subject: true, topic: true, url: true,
  fileName: true, mimeType: true, sizeBytes: true, audienceScope: true, targetCollegeCode: true, targetCollegeName: true, targetBranchCode: true, targetBranchName: true, createdAt: true, updatedAt: true,
} as const;

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const mimeByExtension: Record<string, string> = {
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
};
function parseUploadedFile(req: express.Request): { bytes: Buffer; fileName: string; mimeType: string } {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw badRequest("Choose a non-empty file to upload.");
  if (req.body.length > MAX_FILE_BYTES) throw badRequest("Study files must be 10 MB or smaller.");
  const query = FileMetadata.parse(req.query);
  const fileName = basename(query.fileName).replace(/[\r\n"]/g, "").slice(0, 180);
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const expectedMime = mimeByExtension[extension];
  if (!expectedMime) throw badRequest("Unsupported file type. Upload PDF, TXT, Markdown, DOCX, PPTX, XLSX, PNG or JPG.");
  const suppliedMime = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  const mimeType = suppliedMime === "application/octet-stream" || !suppliedMime ? expectedMime : suppliedMime;
  if (mimeType !== expectedMime && !(extension === "md" && mimeType === "text/plain")) {
    throw badRequest("The selected file type does not match its filename.");
  }
  return { bytes: req.body, fileName, mimeType };
}
function fileSelectHeaders(res: express.Response, fileName: string, mimeType: string, sizeBytes: number) {
  const safeName = fileName.replace(/[\r\n"]/g, "_");
  res.setHeader("Content-Type", mimeType || "application/octet-stream");
  res.setHeader("Content-Length", String(sizeBytes));
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
}

export function studyMaterialRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/study-materials", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const profile = await db.user.findUnique({
        where: { id: req.user!.id },
        select: { role: true, collegeCode: true, collegeName: true, branchCode: true, branchName: true },
      });
      if (!profile) return next(notFound("Student profile was not found."));
      const published = await db.studyMaterial.findMany({
        where: { status: "PUBLISHED", OR: [{ url: { not: "" } }, { fileName: { not: "" } }] },
        orderBy: [{ subject: "asc" }, { title: "asc" }],
        select: publicSelect,
      });
      const materials = profile.role === "ADMIN" ? published : published.filter((item) =>
        isContentAudienceVisible(item as ContentAudience, profile),
      );
      res.json({ ok: true, materials });
    } catch (error) { next(error); }
  });

  router.get("/study-materials/:id/file", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const id = z.string().min(1).max(64).parse(req.params.id);
      const material = await db.studyMaterial.findUnique({ where: { id }, select: {
        status: true, fileName: true, mimeType: true, sizeBytes: true, contentBase64: true,
        audienceScope: true, targetCollegeCode: true, targetCollegeName: true, targetBranchCode: true, targetBranchName: true,
      } });
      if (!material || !material.fileName || !material.contentBase64) return next(notFound("Study file was not found."));
      const account = await db.user.findUnique({ where: { id: req.user!.id }, select: {
        role: true, collegeCode: true, collegeName: true, branchCode: true, branchName: true,
      } });
      if (!account) return next(notFound("Study file was not found."));
      if (material.status !== "PUBLISHED" && account.role !== "ADMIN") return next(notFound("Study file was not found."));
      if (material.status === "PUBLISHED" && account.role !== "ADMIN" && !isContentAudienceVisible(material as ContentAudience, account)) {
        return next(notFound("Study file was not found."));
      }
      const bytes = Buffer.from(material.contentBase64, "base64");
      fileSelectHeaders(res, material.fileName, material.mimeType, bytes.length);
      res.send(bytes);
    } catch (error) { next(error); }
  });

  router.get("/admin/study-materials", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const materials = await db.studyMaterial.findMany({
        orderBy: { createdAt: "desc" },
        select: { ...publicSelect, status: true, uploadedById: true },
        take: 300,
      });
      res.json({ ok: true, materials });
    } catch (error) { next(error); }
  });

  router.post("/admin/study-materials", requireAuth, requireAdmin(db), async (req: AuthedRequest, res, next) => {
    try {
      const input = LinkFields.parse(req.body);
      const material = await db.studyMaterial.create({
        data: { uploadedById: req.user!.id, ...input, ...audienceData(input), fileName: "", mimeType: "", sizeBytes: 0, contentBase64: "", status: "DRAFT" },
        select: { ...publicSelect, status: true },
      });
      res.status(201).json({ ok: true, material });
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Provide valid resource metadata and an HTTPS link."));
      next(error);
    }
  });

  router.post("/admin/study-materials/upload", requireAuth, requireAdmin(db), express.raw({ type: () => true, limit: MAX_FILE_BYTES }), async (req: AuthedRequest, res, next) => {
    try {
      const metadata = FileMetadata.parse(req.query);
      const file = parseUploadedFile(req);
      const material = await db.studyMaterial.create({
        data: {
          uploadedById: req.user!.id, title: metadata.title, description: metadata.description,
          subject: metadata.subject, topic: metadata.topic, ...audienceData(metadata), url: "",
          fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.bytes.length,
          contentBase64: file.bytes.toString("base64"), status: "DRAFT",
        },
        select: { ...publicSelect, status: true },
      });
      res.status(201).json({ ok: true, material });
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Provide valid file metadata."));
      next(error);
    }
  });

  router.patch("/admin/study-materials/:id/file", requireAuth, requireAdmin(db), express.raw({ type: () => true, limit: MAX_FILE_BYTES }), async (req: AuthedRequest, res, next) => {
    try {
      const id = z.string().min(1).max(64).parse(req.params.id);
      if (!await db.studyMaterial.findUnique({ where: { id }, select: { id: true } })) return next(notFound("Study material was not found."));
      const metadata = FileMetadata.parse(req.query);
      const file = parseUploadedFile(req);
      const material = await db.studyMaterial.update({
        where: { id },
        data: {
          title: metadata.title, description: metadata.description, subject: metadata.subject, topic: metadata.topic, ...audienceData(metadata),
          url: "", fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.bytes.length, contentBase64: file.bytes.toString("base64"),
        },
        select: { ...publicSelect, status: true },
      });
      res.json({ ok: true, material });
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Provide valid file metadata."));
      next(error);
    }
  });

  router.patch("/admin/study-materials/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.string().min(1).max(64).parse(req.params.id);
      const patch = MaterialPatch.parse(req.body);
      if (patch.url) ExternalHttpsUrl.parse(patch.url);
      if (!await db.studyMaterial.findUnique({ where: { id }, select: { id: true } })) return next(notFound("Study material was not found."));
      const material = await db.studyMaterial.update({ where: { id }, data: { ...patch, ...(patch.audienceScope ? { audienceScope: patch.audienceScope } : {}) }, select: { ...publicSelect, status: true } });
      res.json({ ok: true, material });
    } catch (error) {
      if (error instanceof z.ZodError) return next(badRequest("Invalid study material update."));
      next(error);
    }
  });

  router.delete("/admin/study-materials/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.string().min(1).max(64).parse(req.params.id);
      if (!await db.studyMaterial.findUnique({ where: { id }, select: { id: true } })) return next(notFound("Study material was not found."));
      await db.studyMaterial.delete({ where: { id } });
      res.json({ ok: true, deleted: true });
    } catch (error) { next(error); }
  });

  return router;
}
