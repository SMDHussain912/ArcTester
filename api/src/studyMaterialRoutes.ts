import { Router } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { badRequest, notFound } from "./errors.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./auth.js";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MIME_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
};
const MetadataSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1000).default(""),
  subject: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(100).default(""),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["application/pdf", "text/plain", "text/markdown"]),
  contentBase64: z.string().min(1).max(12 * 1024 * 1024),
}).strict();

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, "_").slice(0, 150) || "study-material";
}

const publicSelect = {
  id: true, title: true, description: true, subject: true, topic: true,
  fileName: true, mimeType: true, sizeBytes: true, createdAt: true, updatedAt: true,
} as const;

export function studyMaterialRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/study-materials", requireAuth, async (_req, res, next) => {
    try {
      const materials = await db.studyMaterial.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ subject: "asc" }, { title: "asc" }],
        select: publicSelect,
      });
      res.json({ ok: true, materials });
    } catch (error) { next(error); }
  });

  router.get("/study-materials/:id/download", requireAuth, async (req, res, next) => {
    try {
      const id = z.string().min(1).max(64).parse(req.params.id);
      const material = await db.studyMaterial.findFirst({
        where: { id, status: "PUBLISHED" },
      });
      if (!material) return next(notFound("Published study material was not found."));
      const bytes = Buffer.from(material.contentBase64, "base64");
      if (bytes.byteLength !== material.sizeBytes) return next(badRequest("Stored study material failed its integrity check."));
      res.setHeader("Content-Type", material.mimeType);
      res.setHeader("Content-Length", String(bytes.byteLength));
      res.setHeader("Content-Disposition", `attachment; filename="${safeFileName(material.fileName)}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(bytes);
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      next(error);
    }
  });

  router.get("/study-materials/:id/offline", requireAuth, async (req, res, next) => {
    try {
      const id = z.string().min(1).max(64).parse(req.params.id);
      const material = await db.studyMaterial.findFirst({
        where: { id, status: "PUBLISHED", mimeType: { in: ["text/plain", "text/markdown"] } },
      });
      if (!material) return next(notFound("Published text or Markdown study material was not found."));
      const bytes = Buffer.from(material.contentBase64, "base64");
      if (bytes.byteLength !== material.sizeBytes) return next(badRequest("Stored study material failed its integrity check."));
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        ok: true,
        material: {
          id: material.id, title: material.title, description: material.description,
          subject: material.subject, topic: material.topic, fileName: material.fileName,
          mimeType: material.mimeType, sizeBytes: material.sizeBytes, content: bytes.toString("utf8"),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      next(error);
    }
  });

  router.get("/study-materials/:id/preview", requireAuth, async (req, res, next) => {
    try {
      const id = z.string().min(1).max(64).parse(req.params.id);
      const material = await db.studyMaterial.findFirst({
        where: { id, status: "PUBLISHED", mimeType: "application/pdf" },
      });
      if (!material) return next(notFound("Published PDF study material was not found."));
      const bytes = Buffer.from(material.contentBase64, "base64");
      if (bytes.byteLength !== material.sizeBytes) return next(badRequest("Stored study material failed its integrity check."));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", String(bytes.byteLength));
      res.setHeader("Content-Disposition", `inline; filename="${safeFileName(material.fileName)}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(bytes);
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      next(error);
    }
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
      const input = MetadataSchema.parse(req.body);
      const extension = MIME_TYPES[input.mimeType];
      if (!input.fileName.toLowerCase().endsWith(extension)) {
        return next(badRequest(`The selected file must use the ${extension} extension.`));
      }
      const contentBase64 = input.contentBase64.replace(/^data:[^;]+;base64,/, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64) || contentBase64.length % 4 !== 0) {
        return next(badRequest("The uploaded file data is not valid base64."));
      }
      const bytes = Buffer.from(contentBase64, "base64");
      if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) {
        return next(badRequest("Study materials must be between 1 byte and 8 MB."));
      }
      if (input.mimeType === "application/pdf" && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        return next(badRequest("The selected file does not contain a valid PDF signature."));
      }
      const created = await db.studyMaterial.create({
        data: {
          uploadedById: req.user!.id,
          title: input.title,
          description: input.description,
          subject: input.subject,
          topic: input.topic,
          fileName: safeFileName(input.fileName),
          mimeType: input.mimeType,
          sizeBytes: bytes.byteLength,
          contentBase64: bytes.toString("base64"),
          status: "DRAFT",
        },
        select: { ...publicSelect, status: true },
      });
      res.status(201).json({ ok: true, material: created });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      next(error);
    }
  });

  router.patch("/admin/study-materials/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.string().min(1).max(64).parse(req.params.id);
      const input = z.object({
        title: z.string().trim().min(2).max(140).optional(),
        description: z.string().trim().max(1000).optional(),
        subject: z.string().trim().min(1).max(80).optional(),
        topic: z.string().trim().max(100).optional(),
        status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
      }).strict().refine((value) => Object.keys(value).length > 0);
      const data = input.parse(req.body);
      const exists = await db.studyMaterial.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return next(notFound("Study material was not found."));
      const material = await db.studyMaterial.update({ where: { id }, data, select: { ...publicSelect, status: true } });
      res.json({ ok: true, material });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      next(error);
    }
  });

  router.delete("/admin/study-materials/:id", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const id = z.string().min(1).max(64).parse(req.params.id);
      const exists = await db.studyMaterial.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return next(notFound("Study material was not found."));
      await db.studyMaterial.delete({ where: { id } });
      res.json({ ok: true, deleted: true });
    } catch (error) {
      if (error instanceof z.ZodError) return next(error);
      next(error);
    }
  });

  return router;
}
