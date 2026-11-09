import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { runNextModelTrainingJob } from "../src/modelTrainingWorker.js";

function workerDatabase(options: {
  candidate?: Record<string, unknown> | null;
  claimCount?: number;
  claimedJob?: Record<string, unknown> | null;
  dataset?: Record<string, unknown> | null;
} = {}) {
  const findFirst = vi.fn().mockResolvedValue(options.candidate ?? null);
  const findUnique = vi.fn().mockResolvedValue(options.claimedJob ?? null);
  const updateMany = vi.fn()
    .mockResolvedValueOnce({ count: options.claimCount ?? 1 })
    .mockResolvedValue({ count: 1 });
  const datasetFindUnique = vi.fn().mockResolvedValue(options.dataset ?? null);
  const db = {
    modelTrainingJob: { findFirst, findUnique, updateMany },
    modelDataset: { findUnique: datasetFindUnique },
  } as unknown as PrismaClient;
  return { db, findFirst, findUnique, updateMany, datasetFindUnique };
}

describe("durable model-training worker lease recovery", () => {
  it("returns idle when no queued or expired-lease job exists", async () => {
    const mocks = workerDatabase({ candidate: null });

    await expect(runNextModelTrainingJob(mocks.db, "worker-idle")).resolves.toBe(false);

    expect(mocks.findFirst).toHaveBeenCalledOnce();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("reclaims an expired RUNNING lease and records a terminal failure if its dataset disappeared", async () => {
    const expiredAt = new Date(Date.now() - 60_000);
    const mocks = workerDatabase({
      candidate: {
        id: "job-expired",
        datasetId: "dataset-missing",
        modelId: "lease-recovery-test",
        status: "RUNNING",
        progress: 35,
        leaseExpiresAt: expiredAt,
        createdAt: new Date(Date.now() - 120_000),
      },
      claimedJob: {
        id: "job-expired",
        datasetId: "dataset-missing",
        modelId: "lease-recovery-test",
        createdById: "admin-1",
        status: "RUNNING",
        workerId: "worker-recovery",
        seed: 42,
        epochs: 10,
        batchSize: 8,
      },
      dataset: null,
    });

    await expect(runNextModelTrainingJob(mocks.db, "worker-recovery")).resolves.toBe(true);

    const claim = mocks.updateMany.mock.calls[0][0] as {
      where: { id: string; OR: Array<Record<string, unknown>> };
      data: { status: string; workerId: string; progress: number; leaseExpiresAt: Date };
    };
    expect(claim.where.id).toBe("job-expired");
    expect(claim.where.OR).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "QUEUED" }),
      expect.objectContaining({
        status: "RUNNING",
        leaseExpiresAt: { lt: expect.any(Date) },
      }),
    ]));
    expect(claim.data).toMatchObject({
      status: "RUNNING",
      workerId: "worker-recovery",
      progress: 35,
    });
    expect(claim.data.leaseExpiresAt.getTime()).toBeGreaterThan(Date.now());

    const terminalUpdate = mocks.updateMany.mock.calls.at(-1)?.[0] as {
      where: { id: string; status: string; workerId: string };
      data: { status: string; errorMessage: string; completedAt: Date; leaseExpiresAt: null };
    };
    expect(terminalUpdate.where).toEqual({
      id: "job-expired",
      status: "RUNNING",
      workerId: "worker-recovery",
    });
    expect(terminalUpdate.data).toMatchObject({
      status: "FAILED",
      errorMessage: "Training dataset no longer exists.",
      leaseExpiresAt: null,
    });
    expect(terminalUpdate.data.completedAt).toBeInstanceOf(Date);
  });

  it("does not process a job when another worker wins the atomic claim", async () => {
    const mocks = workerDatabase({
      candidate: {
        id: "job-raced",
        datasetId: "dataset-1",
        modelId: "lease-race-test",
        status: "RUNNING",
        progress: 1,
        leaseExpiresAt: new Date(Date.now() - 1),
        createdAt: new Date(),
      },
      claimCount: 0,
    });

    await expect(runNextModelTrainingJob(mocks.db, "worker-loser")).resolves.toBe(false);

    expect(mocks.updateMany).toHaveBeenCalledOnce();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.datasetFindUnique).not.toHaveBeenCalled();
  });
});
