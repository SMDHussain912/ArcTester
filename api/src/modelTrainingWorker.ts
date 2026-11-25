import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { PrismaClient } from "@prisma/client";
import { stableModelJson, trainModel } from "./modelTraining.js";

const LEASE_MS = 15 * 60 * 1000;
const delay = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export async function runOneTrainingJob(db: PrismaClient, workerId: string, now = new Date()): Promise<boolean> {
  const candidate = await db.modelTrainingJob.findFirst({
    where: {
      OR: [
        { status: "QUEUED" },
        { status: "RUNNING", leaseExpiresAt: null },
        { status: "RUNNING", leaseExpiresAt: { lt: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, leaseExpiresAt: true },
  });
  if (!candidate) return false;
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
  const claim = await db.modelTrainingJob.updateMany({
    where: candidate.status === "QUEUED"
      ? { id: candidate.id, status: "QUEUED" }
      : { id: candidate.id, status: "RUNNING", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
    data: { status: "RUNNING", progress: 5, workerId, leaseExpiresAt, errorMessage: "", updatedAt: now },
  });
  if (claim.count !== 1) return false;

  try {
    const job = await db.modelTrainingJob.findUnique({
      where: { id: candidate.id },
      include: { dataset: true },
    });
    if (!job) throw new Error("Claimed training job disappeared.");
    if (!["training", "synthetic"].includes(job.dataset.datasetKind)) throw new Error("Worker only trains on training or synthetic datasets.");
    const trained = trainModel({
      task: job.dataset.task as "classification" | "regression",
      targetColumn: job.dataset.targetColumn,
      featureSchemaJson: job.dataset.featureSchemaJson,
      samplesJson: job.dataset.samplesJson,
    }, { seed: job.seed, epochs: job.epochs });
    const artifactJson = stableModelJson(trained.artifact);
    const checksum = sha256(artifactJson);
    const inputSchema = JSON.parse(job.dataset.featureSchemaJson) as Record<string, unknown>;
    const outputSchema = { task: job.dataset.task, targetColumn: job.dataset.targetColumn, predictionType: job.dataset.task === "classification" ? "label" : "number" };
    const result = {
      uri: "db://arctester/model-artifact/" + job.id,
      sha256: checksum,
      framework: "arctester-native",
      inputSchema,
      outputSchema,
      metrics: trained.metrics,
      version: 0,
      algorithm: trained.algorithm,
    };
    const completedAt = new Date();
    await db.$transaction(async tx => {
      const latest = await tx.registeredModel.findFirst({
        where: { modelId: job.modelId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;
      result.version = version;
      const artifactMetadata = { ...result, modelArtifact: trained.artifact };
      await tx.registeredModel.create({
        data: {
          id: randomUUID().replace(/-/g, ""),
          modelId: job.modelId,
          version,
          algorithm: trained.algorithm,
          task: job.dataset.task,
          dataset: job.dataset.name,
          trainingDatasetId: job.dataset.id,
          artifactJson: stableModelJson(artifactMetadata),
          isActive: false,
        },
      });
      await tx.modelRegistryAudit.create({
        data: {
          id: randomUUID().replace(/-/g, ""),
          actorId: job.createdById,
          modelId: job.modelId,
          version,
          action: "TRAINED_AND_REGISTERED",
          details: stableModelJson({ jobId: job.id, datasetId: job.dataset.id, datasetFingerprint: job.dataset.fingerprint, sha256: checksum, metrics: trained.metrics }),
        },
      });
      await tx.modelTrainingJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          progress: 100,
          workerId,
          leaseExpiresAt: null,
          resultJson: stableModelJson(result),
          errorMessage: "",
          completedAt,
          updatedAt: completedAt,
        },
      });
    });
    return true;
  } catch (error) {
    const failedAt = new Date();
    const message = error instanceof Error ? error.message : "Training worker failed.";
    await db.modelTrainingJob.update({
      where: { id: candidate.id },
      data: {
        status: "FAILED",
        progress: 100,
        workerId,
        leaseExpiresAt: null,
        errorMessage: message.slice(0, 500),
        completedAt: failedAt,
        updatedAt: failedAt,
      },
    });
    return true;
  }
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  const workerId = (process.env.MODEL_WORKER_ID?.trim() || hostname() + "-" + process.pid + "-" + randomUUID().slice(0, 8)).slice(0, 120);
  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  console.info("[model-worker] started", { workerId });
  try {
    while (!stopping) {
      const claimed = await runOneTrainingJob(db, workerId);
      if (!claimed) await delay(2000);
    }
  } finally {
    await db.$disconnect();
    console.info("[model-worker] stopped", { workerId });
  }
}

if (process.argv[1]?.endsWith("modelTrainingWorker.ts") || process.argv[1]?.endsWith("modelTrainingWorker.js")) {
  main().catch(error => {
    console.error("[model-worker] fatal", error);
    process.exitCode = 1;
  });
}
