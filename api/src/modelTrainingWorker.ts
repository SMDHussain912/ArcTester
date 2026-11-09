import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { trainTensorflowRegressionCandidate } from "./intelligence/tensorflowJsTraining.js";

const LEASE_MS = 2 * 60 * 1000;

type DatasetFeature = { name: string; type: "numeric" | "categorical"; categories?: string[] };
type DatasetSample = { features: Record<string, number | string>; target: number; groupId?: string };

async function processJob(db: PrismaClient, jobId: string, workerId: string): Promise<void> {
  const job = await db.modelTrainingJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "RUNNING" || job.workerId !== workerId) return;

  const heartbeat = setInterval(() => {
    void db.modelTrainingJob.updateMany({
      where: { id: jobId, status: "RUNNING", workerId },
      data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
    }).catch((error: unknown) => {
      console.error("ArcTester training-job lease renewal failed", error);
    });
  }, 30_000);

  try {
    const dataset = await db.modelDataset.findUnique({ where: { id: job.datasetId } });
    if (!dataset) throw new Error("Training dataset no longer exists.");
    if (dataset.task !== "regression") throw new Error("TensorFlow.js training currently supports regression datasets only.");

    const featureSchema = JSON.parse(dataset.featureSchemaJson) as DatasetFeature[];
    if (!featureSchema.length || featureSchema.some((feature) => feature.type !== "numeric")) {
      throw new Error("TensorFlow.js training requires a non-empty numeric-only feature schema.");
    }
    const samples = JSON.parse(dataset.samplesJson) as DatasetSample[];
    if (samples.some((sample) =>
      !sample.groupId || !/^[a-f0-9]{64}$/.test(sample.groupId) ||
      featureSchema.some((feature) => typeof sample.features[feature.name] !== "number" ||
        !Number.isFinite(sample.features[feature.name]))
    )) {
      throw new Error("Every TensorFlow sample must contain finite numeric features and a keyed HMAC-SHA-256 pseudonymous groupId.");
    }
    if (job.modelId === "student-score-population") {
      const expected = ["completed_attempts", "previous_accuracy", "recent_average_accuracy", "overall_average_accuracy", "previous_question_count"];
      const actual = featureSchema.map((feature) => feature.name);
      if (actual.length !== expected.length || expected.some((name) => !actual.includes(name)) ||
          samples.some((sample) => {
            const f = sample.features;
            return !Number.isInteger(f.completed_attempts) || Number(f.completed_attempts) < 3 ||
              !Number.isInteger(f.previous_question_count) || Number(f.previous_question_count) < 1 ||
              ![f.previous_accuracy, f.recent_average_accuracy, f.overall_average_accuracy]
                .every((value) => typeof value === "number" && value >= 0 && value <= 1) ||
              sample.target < 0 || sample.target > 1;
          })) {
        throw new Error("student-score-population dataset does not match the registered feature and target constraints.");
      }
    }

    await db.modelTrainingJob.updateMany({
      where: { id: jobId, status: "RUNNING", workerId },
      data: { progress: 10, leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
    });
    const latest = await db.registeredModel.aggregate({
      where: { modelId: job.modelId },
      _max: { version: true },
    });
    const version = (latest._max.version ?? 0) + 1;
    const trained = await trainTensorflowRegressionCandidate(
      samples.map((sample) => ({
        features: featureSchema.map((feature) => sample.features[feature.name] as number),
        target: sample.target,
        groupId: sample.groupId!,
      })),
      {
        modelId: job.modelId,
        version,
        featureNames: featureSchema.map((feature) => feature.name),
        datasetKind: dataset.datasetKind as "synthetic" | "real-anonymized",
        seed: job.seed,
        epochs: job.epochs,
        batchSize: job.batchSize,
      },
    );

    await db.modelTrainingJob.updateMany({
      where: { id: jobId, status: "RUNNING", workerId },
      data: { progress: 85, leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
    });

    let registeredModel = null;
    if (trained.artifact) {
      registeredModel = await db.$transaction(async (tx) => {
        const created = await tx.registeredModel.create({
          data: {
            modelId: job.modelId,
            version,
            algorithm: "tensorflow-js-layers",
            task: "regression",
            dataset: dataset.name,
            trainingDatasetId: dataset.id,
            artifactJson: JSON.stringify(trained.artifact),
            isActive: false,
            activatedAt: null,
          },
          select: { modelId: true, version: true, algorithm: true, task: true, dataset: true, isActive: true, createdAt: true },
        });
        await tx.modelRegistryAudit.create({
          data: {
            actorId: job.createdById,
            modelId: job.modelId,
            version,
            action: "TRAINED_TENSORFLOW",
            details: JSON.stringify({
              jobId,
              datasetId: dataset.id,
              datasetFingerprint: dataset.fingerprint,
              trainRows: trained.split.trainRows,
              testRows: trained.split.testRows,
              trainGroups: trained.split.trainGroups,
              testGroups: trained.split.testGroups,
              candidate: trained.candidate,
              baseline: trained.baseline,
              productionEligible: trained.productionEligible,
              reason: trained.reason,
              seed: job.seed,
              epochs: job.epochs,
              batchSize: job.batchSize,
            }),
          },
        });
        return created;
      });
    } else {
      await db.modelRegistryAudit.create({
        data: {
          actorId: job.createdById,
          modelId: job.modelId,
          version,
          action: "TENSORFLOW_CANDIDATE_REJECTED",
          details: JSON.stringify({
            jobId,
            datasetId: dataset.id,
            datasetFingerprint: dataset.fingerprint,
            candidate: trained.candidate,
            baseline: trained.baseline,
            split: trained.split,
            reason: trained.reason,
          }),
        },
      });
    }

    const result = {
      model: registeredModel,
      promoted: false,
      productionEligible: trained.productionEligible,
      split: trained.split,
      candidate: trained.candidate,
      baseline: trained.baseline,
      reason: trained.reason,
    };
    await db.modelTrainingJob.updateMany({
      where: { id: jobId, status: "RUNNING", workerId },
      data: {
        status: "SUCCEEDED",
        progress: 100,
        resultJson: JSON.stringify(result),
        errorMessage: "",
        completedAt: new Date(),
        leaseExpiresAt: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Training failed for an unknown reason.";
    await db.modelTrainingJob.updateMany({
      where: { id: jobId, status: "RUNNING", workerId },
      data: {
        status: "FAILED",
        errorMessage: message.slice(0, 1500),
        completedAt: new Date(),
        leaseExpiresAt: null,
      },
    });
  } finally {
    clearInterval(heartbeat);
  }
}

/** Atomically claims one queued or expired-lease job. Safe for multiple API instances. */
export async function runNextModelTrainingJob(db: PrismaClient, workerId = randomUUID()): Promise<boolean> {
  const now = new Date();
  const candidate = await db.modelTrainingJob.findFirst({
    where: {
      OR: [
        { status: "QUEUED" },
        { status: "RUNNING", leaseExpiresAt: { lt: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return false;

  const claimed = await db.modelTrainingJob.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: "QUEUED" },
        { status: "RUNNING", leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      status: "RUNNING",
      workerId,
      progress: Math.max(candidate.progress, 1),
      startedAt: new Date(),
      leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      errorMessage: "",
    },
  });
  if (claimed.count !== 1) return false;
  await processJob(db, candidate.id, workerId);
  return true;
}

/** Starts a single polling loop for this API process; stop it during graceful shutdown. */
export function startModelTrainingWorker(db: PrismaClient): () => void {
  const workerId = randomUUID();
  let busy = false;
  const poll = async () => {
    if (busy) return;
    busy = true;
    try {
      await runNextModelTrainingJob(db, workerId);
    } catch (error) {
      console.error("ArcTester model-training worker poll failed", error);
    } finally {
      busy = false;
    }
  };
  void poll();
  const timer = setInterval(() => void poll(), 2_000);
  timer.unref();
  return () => clearInterval(timer);
}
