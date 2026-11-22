import express, { Router } from "express";
import { basename } from "node:path";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, notFound } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";

const ExternalHttpsUrl = z.string().trim().url().max(2048).refine((value) => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}, "Study material links must be valid HTTPS URLs without embedded credentials.");

const LinkFields = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1000).default(""),
  subject: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(100).default(""),
  url: ExternalHttpsUrl,
}).strict();

const FileMetadata = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1000).default(""),
  subject: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(100).default(""),
  fileName: z.string().trim().min(1).max(180),
}).strict();

const MaterialPatch = z.object({
  title: z.string().trim().min(2).max(140).optional(),
  description: z.string().trim().max(1000).optional(),
  subject: z.string().trim().min(1).max(80).optional(),
  topic: z.string().trim().max(100).optional(),
  url: z.string().trim().max(2048).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

const publicSelect = {
  id: true, title: true, description: true, subject: true, topic: true, url: true,
  fileName: true, mimeType: true, sizeBytes: true, createdAt: true, updatedAt: true,
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
  const fileName = basename(query.fileName).replace(/[\\r\\n"]/g, "").slice(0, 180);
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
  const safeName = fileName.replace(/[\\r\\n"]/g, "_");
  res.setHeader("Content-Type", mimeType || "application/octet-stream");
  res.setHeader("Content-Length", String(sizeBytes));
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
}

export function studyMaterialRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/study-materials", requireAuth, async (_req, res, next) => {
    try {
      const materials = await db.studyMaterial.findMany({
        where: { status: "PUBLISHED", OR: [{ url: { not: "" } }, { fileName: { not: "" } }] },
        orderBy: [{ subject: "asc" }, { title: "asc" }],
        select: publicSelect,
      });
      res.json({ ok: true, materials });
    } catch (error) { next(error); }
  });

  router.get("/study-materials/:id/file", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const id = z.string().min(1).max(64).parse(req.params.id);
      const material = await db.studyMaterial.findUnique({ where: { id }, select: { status: true, fileName: true, mimeType: true, sizeBytes: true, contentBase64: true } });
      if (!material || !material.fileName || !material.contentBase64 || (material.status !== "PUBLISHED" && req.user?.role !== "ADMIN")) return next(notFound("Study file was not found."));
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
        data: { uploadedById: req.user!.id, ...input, fileName: "", mimeType: "", sizeBytes: 0, contentBase64: "", status: "DRAFT" },
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
          subject: metadata.subject, topic: metadata.topic, url: "",
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
          title: metadata.title, description: metadata.description, subject: metadata.subject, topic: metadata.topic,
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
      const material = await db.studyMaterial.update({ where: { id }, data: patch, select: { ...publicSelect, status: true } });
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
