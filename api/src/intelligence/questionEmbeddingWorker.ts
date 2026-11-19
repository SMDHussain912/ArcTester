import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { buildQuestionEmbedding } from "./questionEmbeddings.js";
import { getOnnxQuestionEmbeddingEncoder } from "./questionEmbeddingOnnx.js";

const LEASE_MS = 2 * 60 * 1000;

async function processJob(db: PrismaClient, jobId: string, workerId: string): Promise<void> {
  const job = await db.questionEmbeddingJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "RUNNING" || job.workerId !== workerId) return;
  const heartbeat = setInterval(() => {
    void db.questionEmbeddingJob.updateMany({
      where: { id: jobId, status: "RUNNING", workerId, leaseExpiresAt: { gt: new Date() } },
      data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
    }).catch((error: unknown) => console.error("ArcTester question-embedding lease renewal failed", error));
  }, 30_000);

  try {
    const encoder = await getOnnxQuestionEmbeddingEncoder();
    let cursor = job.cursorQuestionId;
    while (true) {
      let targetedIds: number[] | null = null;
      if (job.questionIdsJson) {
        try {
          const parsed: unknown = JSON.parse(job.questionIdsJson);
          if (!Array.isArray(parsed) || !parsed.every((id) => Number.isSafeInteger(id) && id > 0)) {
            throw new Error("Question embedding job contains invalid target IDs.");
          }
          targetedIds = parsed as number[];
        } catch {
          throw new Error("Question embedding job target IDs are invalid JSON.");
        }
      }
      const questions = await db.question.findMany({
        where: targetedIds
          ? { AND: [{ id: { in: targetedIds } }, { id: { gt: cursor } }] }
          : { id: { gt: cursor } },
        orderBy: { id: "asc" },
        take: job.batchSize,
        select: {
          id: true, text: true, explanation: true,
          subject: { select: { name: true } },
          topic: { select: { name: true } },
        },
      });
      if (questions.length === 0) break;
      for (const question of questions) {
        const record = await buildQuestionEmbedding({
          questionId: question.id,
          stem: question.text,
          subject: question.subject.name,
          topic: question.topic?.name ?? "General",
          approvedExplanation: question.explanation,
        }, encoder);
        const existing = await db.questionEmbedding.findUnique({ where: { questionId: question.id } });
        const current = existing?.sourceHash === record.sourceHash &&
          existing.embeddingModel === record.embeddingModel &&
          existing.embeddingVersion === record.embeddingVersion;
        if (job.force || !current) {
          await db.questionEmbedding.upsert({
            where: { questionId: question.id },
            create: {
              questionId: record.questionId,
              embeddingJson: JSON.stringify(record.embedding),
              embeddingModel: record.embeddingModel,
              embeddingVersion: record.embeddingVersion,
              sourceHash: record.sourceHash,
            },
            update: {
              embeddingJson: JSON.stringify(record.embedding),
              embeddingModel: record.embeddingModel,
              embeddingVersion: record.embeddingVersion,
              sourceHash: record.sourceHash,
            },
          });
        }
      }
      cursor = questions[questions.length - 1]!.id;
      const renewed = await db.questionEmbeddingJob.updateMany({
        where: { id: jobId, status: "RUNNING", workerId, leaseExpiresAt: { gt: new Date() } },
        data: {
          cursorQuestionId: cursor,
          progress: { increment: questions.length },
          leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        },
      });
      if (renewed.count !== 1) throw new Error("Question-embedding worker lease was lost during batch processing.");
    }

    const completed = await db.questionEmbeddingJob.updateMany({
      where: { id: jobId, status: "RUNNING", workerId, leaseExpiresAt: { gt: new Date() } },
      data: { status: "SUCCEEDED", progress: job.total, completedAt: new Date(), leaseExpiresAt: null, errorMessage: "" },
    });
    if (completed.count !== 1) throw new Error("Question-embedding worker lease was lost before completion.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Question embedding failed for an unknown reason.";
    await db.questionEmbeddingJob.updateMany({
      where: { id: jobId, status: "RUNNING", workerId, leaseExpiresAt: { gt: new Date() } },
      data: { status: "FAILED", errorMessage: message.slice(0, 1500), completedAt: new Date(), leaseExpiresAt: null },
    });
  } finally {
    clearInterval(heartbeat);
  }
}

/** Claims one queued or expired job atomically; safe across multiple API instances. */
export async function runNextQuestionEmbeddingJob(db: PrismaClient, workerId = randomUUID()): Promise<boolean> {
  const now = new Date();
  const candidate = await db.questionEmbeddingJob.findFirst({
    where: { OR: [{ status: "QUEUED" }, { status: "RUNNING", leaseExpiresAt: { lt: now } }] },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return false;
  const claimed = await db.questionEmbeddingJob.updateMany({
    where: {
      id: candidate.id,
      OR: [{ status: "QUEUED" }, { status: "RUNNING", leaseExpiresAt: { lt: now } }],
    },
    data: {
      status: "RUNNING", workerId, startedAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + LEASE_MS), errorMessage: "",
    },
  });
  if (claimed.count !== 1) return false;
  await processJob(db, candidate.id, workerId);
  return true;
}

/** Starts a low-frequency poller; model weights are downloaded only when a job is queued. */
export function startQuestionEmbeddingWorker(db: PrismaClient): () => void {
  const workerId = randomUUID();
  let busy = false;
  const poll = async () => {
    if (busy) return;
    busy = true;
    try { await runNextQuestionEmbeddingJob(db, workerId); }
    catch (error) { console.error("ArcTester question-embedding worker poll failed", error); }
    finally { busy = false; }
  };
  void poll();
  const timer = setInterval(() => void poll(), 5_000);
  timer.unref();
  return () => clearInterval(timer);
}
